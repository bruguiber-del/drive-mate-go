// Pure geo/math helpers used by MapView — extracted so they can be unit
// tested in isolation, without needing a live Mapbox instance.

/** Minimum GPS movement (m) before propagating a new position to the app. */
export const MIN_MOVE_METERS = 6;

const toRad = (d: number) => (d * Math.PI) / 180;

/**
 * Equirectangular approximation of the distance (m) between two [lat, lng]
 * points. Cheap and accurate enough for the short distances (tens of
 * metres) this app uses it for — GPS jitter filtering and "have we moved
 * far enough to trust the heading" checks.
 */
export function approxMetersBetween(a: [number, number], b: [number, number]): number {
  const dLat = (b[0] - a[0]) * 111320;
  const dLng = (b[1] - a[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** Máxima distancia (m) a la que se "engancha" el punto a la ruta — por
 *  encima de esto se asume que es un desvío real, no ruido de GPS, y se
 *  enseña la posición cruda. */
export const SNAP_TO_ROUTE_MAX_M = 25;

/** Núcleo compartido de "proyectar un punto sobre la polilínea de una
 *  ruta" — plano local en metros centrado en `point`, misma aproximación
 *  que approxMetersBetween, barata y de sobra para tramos cortos de
 *  carretera. nearestPointOnRoute, distanceAlongRoute y
 *  nearestRouteSegmentIndex comparten este cálculo; solo cambia qué hacen
 *  con el resultado (el punto en sí, cuánto se ha recorrido, o en qué
 *  segmento cae) y qué umbral de distancia aceptan. */
function projectOntoRoute(
  point: [number, number],
  route: [number, number][],
): { distSq: number; segment: number; t: number } | null {
  if (route.length < 2) return null;
  const lngScale = Math.cos((point[0] * Math.PI) / 180);
  const toXY = (p: [number, number]): [number, number] => [
    (p[1] - point[1]) * 111320 * lngScale,
    (p[0] - point[0]) * 111320,
  ];

  let best: { distSq: number; segment: number; t: number } | null = null;
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = toXY(route[i]);
    const b = toXY(route[i + 1]);
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const lenSq = abx * abx + aby * aby;
    // t = proyección de (0,0) sobre el segmento a→b, acotada a [0,1] para
    // no salirse del tramo cuando la perpendicular cae fuera de él.
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(a[0] * abx + a[1] * aby) / lenSq));
    const projX = a[0] + abx * t;
    const projY = a[1] + aby * t;
    const distSq = projX * projX + projY * projY;
    if (!best || distSq < best.distSq) best = { distSq, segment: i, t };
  }
  return best;
}

/**
 * Punto más cercano a `point` sobre la polilínea `route` (proyectando
 * sobre cada segmento, no solo sobre los vértices).
 *
 * Devuelve null si la ruta tiene menos de 2 puntos o si el más cercano
 * queda a más de SNAP_TO_ROUTE_MAX_M — en ese caso el GPS crudo ya no es
 * "ruido alrededor de la vía", sino un desvío real que no hay que ocultar.
 */
export function nearestPointOnRoute(
  point: [number, number],
  route: [number, number][],
): [number, number] | null {
  const best = projectOntoRoute(point, route);
  if (!best || Math.sqrt(best.distSq) > SNAP_TO_ROUTE_MAX_M) return null;
  const lngScale = Math.cos((point[0] * Math.PI) / 180);
  const a = route[best.segment];
  const b = route[best.segment + 1];
  return [a[0] + (b[0] - a[0]) * best.t, a[1] + (b[1] - a[1]) * best.t];
}

/** Más margen que SNAP_TO_ROUTE_MAX_M (25m) a propósito: esto decide a qué
 *  PASO de la maniobra (o a qué límite de velocidad) corresponde tu
 *  posición, no si hay que "enganchar" el punto a la ruta — un desvío de
 *  carril normal o ruido de GPS algo mayor no debería hacer que se pierda
 *  la cuenta de en qué tramo vas. */
const ROUTE_PROGRESS_MAX_M = 80;

/**
 * Distancia (m) desde el inicio de `route` hasta el punto de la polilínea
 * más cercano a `point` — a diferencia de nearestPointOnRoute(), que
 * devuelve UN PUNTO, esto devuelve CUÁNTO llevas recorrido de la ruta.
 *
 * Por qué hace falta: antes se elegía el paso actual de navegación por el
 * punto de maniobra (maneuver.location) más cercano en línea recta a tu
 * posición — pero eso no tiene en cuenta el camino real. En una rotonda,
 * por ejemplo, la salida puede quedar geométricamente más cerca de donde
 * estás que la propia entrada (son casi el mismo punto en el mapa, aunque
 * sean pasos distintos y la carretera dé una vuelta entera entre medias),
 * así que el paso "actual" podía saltar al equivocado y toda la distancia
 * mostrada (metros hasta la maniobra, km restantes por ese carril...)
 * salía mal — podía incluso IR SUBIENDO según avanzabas, si el salto te
 * dejaba en un paso más lejano del que ya habías pasado. Proyectar sobre
 * la polilínea en vez de sobre los puntos de maniobra sueltos sigue el
 * camino de verdad, no la línea recta entre dos puntos que pueden estar
 * lejos en la carretera pero cerca en el mapa.
 *
 * Devuelve null si la ruta tiene menos de 2 puntos o si el punto más
 * cercano de la polilínea queda a más de ROUTE_PROGRESS_MAX_M — ahí ya no
 * se puede saber con fiabilidad en qué tramo de la ruta estás.
 */
export function distanceAlongRoute(point: [number, number], route: [number, number][]): number | null {
  const best = projectOntoRoute(point, route);
  if (!best || Math.sqrt(best.distSq) > ROUTE_PROGRESS_MAX_M) return null;

  let cumulative = 0;
  for (let i = 0; i < best.segment; i += 1) {
    cumulative += approxMetersBetween(route[i], route[i + 1]);
  }
  cumulative += approxMetersBetween(route[best.segment], route[best.segment + 1]) * best.t;
  return cumulative;
}

/** En qué segmento de `route` (índice del punto inicial, 0-based) cae tu
 *  posición — para leer, p. ej., el límite de velocidad de ESE tramo
 *  concreto (annotations=maxspeed de Mapbox da un valor por segmento,
 *  igual que ya hace congestion). Mismo umbral y mismo criterio de "no sé
 *  en qué tramo estás" que distanceAlongRoute(). */
export function nearestRouteSegmentIndex(point: [number, number], route: [number, number][]): number | null {
  const best = projectOntoRoute(point, route);
  if (!best || Math.sqrt(best.distSq) > ROUTE_PROGRESS_MAX_M) return null;
  return best.segment;
}

/**
 * Bearing (0-360) desde `point` hacia un punto `lookAheadM` metros más
 * adelante SOBRE LA POLILÍNEA de la ruta — es decir, hacia dónde va la
 * CARRETERA desde aquí, no hacia dónde apunta el GPS o la brújula en este
 * instante. A diferencia del rumbo por puntos GPS consecutivos (que puede
 * ir a saltos por ruido, o quedarse plano parado en un semáforo) o de la
 * brújula (que un imán del coche puede desviar), esto sigue el trazado
 * real de la vía: si vas recto y la carretera gira a la derecha un poco
 * más adelante, el rumbo ya lo anticipa en vez de esperar a estar en la
 * curva para notarlo.
 *
 * Devuelve null si el punto no está lo bastante cerca de la ruta (desvío
 * real) o si la ruta es demasiado corta.
 */
export function bearingAlongRoute(
  point: [number, number],
  route: [number, number][],
  lookAheadM: number,
): number | null {
  const segment = nearestRouteSegmentIndex(point, route);
  const snapped = nearestPointOnRoute(point, route);
  if (segment == null || !snapped) return null;

  let from = snapped;
  let remaining = lookAheadM;
  for (let i = segment + 1; i < route.length; i += 1) {
    const to = route[i];
    const segLen = approxMetersBetween(from, to);
    if (segLen >= remaining) {
      const t = remaining / segLen;
      const targetLat = from[0] + (to[0] - from[0]) * t;
      const targetLng = from[1] + (to[1] - from[1]) * t;
      return computeBearing(snapped, { lat: targetLat, lng: targetLng });
    }
    remaining -= segLen;
    from = to;
  }
  // La ruta se acaba antes de llegar a lookAheadM — apunta al último
  // punto que quede, mejor que nada (ya casi has llegado al destino). Si
  // ya estás prácticamente EN ese último punto no queda ningún rumbo que
  // tenga sentido mostrar.
  const last = route[route.length - 1];
  return approxMetersBetween(snapped, last) > 0.5 ? computeBearing(snapped, { lat: last[0], lng: last[1] }) : null;
}

/** Por debajo de esto no merece la pena recortar la ruta ya recorrida —
 *  más allá, el desvío real ya dispara un recálculo de ruta aparte (ver
 *  useRouting), así que la línea vieja se sustituye entera pronto de
 *  todos modos y recortarla aquí solo añadiría ruido visual. */
const TRIM_ROUTE_MAX_M = 100;

/**
 * Recorta la polilínea de la ruta a partir del punto más cercano a `point`
 * — antes la línea azul se dibujaba entera una sola vez y se quedaba ahí
 * fija aunque se fuera avanzando por ella, sin "borrarse" el tramo ya
 * recorrido como en cualquier app de navegación normal.
 *
 * Si se pasa `congestion` (un valor por segmento, alineado con `route`), se
 * recorta exactamente igual para que cada color de tráfico se quede con el
 * tramo que de verdad le corresponde — si no, al quitar segmentos del
 * principio el tráfico pintado se desplazaría y no cuadraría con la calle.
 *
 * Devuelve la ruta (y congestion) sin tocar si tiene menos de 2 puntos o si
 * el punto queda a más de TRIM_ROUTE_MAX_M (desvío real, no ruido de GPS).
 */
export function remainingRouteFrom(
  point: [number, number],
  route: [number, number][],
  congestion?: string[],
): { coordinates: [number, number][]; congestion?: string[] } {
  if (route.length < 2) return { coordinates: route, congestion };
  const lngScale = Math.cos((point[0] * Math.PI) / 180);
  const toXY = (p: [number, number]): [number, number] => [
    (p[1] - point[1]) * 111320 * lngScale,
    (p[0] - point[0]) * 111320,
  ];
  const fromXY = (xy: [number, number]): [number, number] => [
    point[0] + xy[1] / 111320,
    point[1] + xy[0] / (111320 * lngScale),
  ];

  let best: { distSq: number; xy: [number, number]; segment: number; t: number } | null = null;
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = toXY(route[i]);
    const b = toXY(route[i + 1]);
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const lenSq = abx * abx + aby * aby;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(a[0] * abx + a[1] * aby) / lenSq));
    const projX = a[0] + abx * t;
    const projY = a[1] + aby * t;
    const distSq = projX * projX + projY * projY;
    if (!best || distSq < best.distSq) best = { distSq, xy: [projX, projY], segment: i, t };
  }
  if (!best || Math.sqrt(best.distSq) > TRIM_ROUTE_MAX_M) return { coordinates: route, congestion };

  const projected = fromXY(best.xy);
  const rest = route.slice(best.segment + 1);
  // t≈1 significa que el punto proyectado prácticamente coincide con el
  // siguiente vértice — no hace falta duplicarlo al principio del resto,
  // y en ese caso el primer segmento que queda ya es el siguiente original
  // (best.segment + 1), no el que se acaba de dejar atrás.
  const snapsToNextVertex = best.t >= 0.999 && rest.length > 0;
  const coordinates = snapsToNextVertex ? rest : rest.length > 0 ? [projected, ...rest] : [projected];
  const trimmedCongestion = congestion?.slice(snapsToNextVertex ? best.segment + 1 : best.segment);
  return { coordinates, congestion: trimmedCongestion };
}

/**
 * Walks a list of [lat, lng] points in order and returns true as soon as
 * the cumulative distance between consecutive points exceeds thresholdM.
 * Mirrors MapView's `hasReliableMovement`: it measures path length, not
 * straight-line displacement, so backtracking still counts as movement.
 */
export function cumulativeDistanceExceeds(
  points: [number, number][],
  thresholdM: number,
): boolean {
  let meters = 0;
  for (let i = 1; i < points.length; i += 1) {
    meters += approxMetersBetween(points[i - 1], points[i]);
    if (meters > thresholdM) return true;
  }
  return false;
}

/**
 * Initial great-circle bearing (degrees, 0-360, 0 = north) from `from` to
 * `to`, both [lat, lng]. This is the "as the crow flies" straight line
 * used to orient the map toward the destination before/while navigating.
 */
export function computeBearing(from: [number, number], to: { lat: number; lng: number }): number {
  const φ1 = toRad(from[0]);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from[1]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Rotation (degrees, 0-360) to apply to the user marker icon in *screen*
 * space so it visually points toward `headingDeg` (0 = north), given the
 * map camera is currently rotated by `mapBearingDeg`.
 *
 * Mapbox markers don't auto-rotate with the map, so a marker meant to show
 * a compass heading needs its own CSS rotation — but if the map camera
 * ALSO rotates to bring that same heading "up" on screen (as this app does
 * while navigating), rotating the icon by the raw heading on top of that
 * double-counts the turn. Subtracting the map's own bearing cancels that
 * out: the icon ends up pointing straight up when the map is already
 * oriented toward the heading, and shows the full heading when the map
 * stays put (e.g. idle, north-up).
 */
export function markerScreenRotation(headingDeg: number, mapBearingDeg: number): number {
  return ((headingDeg - mapBearingDeg) % 360 + 360) % 360;
}

/** Speed tiers (km/h) driving the dynamic camera zoom/pitch while navigating. */
export type SpeedTier = 'city' | 'medium' | 'highway';

export const TIER_CAMERA: Record<SpeedTier, { zoom: number; pitch: number }> = {
  city: { zoom: 17.5, pitch: 60 },
  medium: { zoom: 16, pitch: 55 },
  highway: { zoom: 14.5, pitch: 45 },
};

/**
 * Next speed tier given the current speed (km/h) and tier, with hysteresis
 * (upward thresholds 20/80, downward 15/70) so the camera doesn't flicker
 * between tiers when the speed hovers near a boundary.
 */
export function nextSpeedTier(kmh: number, current: SpeedTier): SpeedTier {
  if (current === 'city') return kmh > 20 ? (kmh > 80 ? 'highway' : 'medium') : 'city';
  if (current === 'medium') {
    if (kmh > 80) return 'highway';
    if (kmh < 15) return 'city';
    return 'medium';
  }
  if (kmh < 15) return 'city';
  if (kmh < 70) return 'medium';
  return 'highway';
}
