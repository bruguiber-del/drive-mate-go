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

/**
 * Punto más cercano a `point` sobre la polilínea `route` (proyectando
 * sobre cada segmento, no solo sobre los vértices) — plano local en metros
 * centrado en `point`, misma aproximación que approxMetersBetween, barata
 * y de sobra para los tramos cortos de un segmento de carretera.
 *
 * Devuelve null si la ruta tiene menos de 2 puntos o si el más cercano
 * queda a más de SNAP_TO_ROUTE_MAX_M — en ese caso el GPS crudo ya no es
 * "ruido alrededor de la vía", sino un desvío real que no hay que ocultar.
 */
export function nearestPointOnRoute(
  point: [number, number],
  route: [number, number][],
): [number, number] | null {
  if (route.length < 2) return null;
  const lngScale = Math.cos((point[0] * Math.PI) / 180);
  const toXY = (p: [number, number]): [number, number] => [
    (p[1] - point[1]) * 111320 * lngScale,
    (p[0] - point[0]) * 111320,
  ];
  const fromXY = (xy: [number, number]): [number, number] => [
    point[0] + xy[1] / 111320,
    point[1] + xy[0] / (111320 * lngScale),
  ];

  let best: { distSq: number; xy: [number, number] } | null = null;
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
    if (!best || distSq < best.distSq) best = { distSq, xy: [projX, projY] };
  }
  if (!best || Math.sqrt(best.distSq) > SNAP_TO_ROUTE_MAX_M) return null;
  return fromXY(best.xy);
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
