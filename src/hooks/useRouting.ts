import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MAPBOX_TOKEN } from '@/lib/mapboxConfig';

export interface VoiceInstruction {
  /** Distance (m) before the maneuver at which this should be announced */
  distanceAlongGeometry: number;
  announcement: string;
}

/** Un carril del cruce/autovía justo antes de la maniobra — "indications"
 *  son las direcciones válidas desde ese carril (p. ej. ["left"], o
 *  ["straight","right"] si sirve para las dos); "active" marca si ESTE
 *  carril es el que hay que coger para seguir la ruta. Mapbox ya manda
 *  esto en bannerInstructions.sub cuando banner_instructions=true, pero
 *  hasta ahora se descartaba sin usarlo — por eso en una vía de 2+
 *  carriles nunca se señalaba cuál coger. */
export interface RouteLane {
  indications: string[];
  active: boolean;
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  maneuver: {
    type: string;
    modifier?: string;
    location: [number, number];
    /** Nº de salida en una rotonda (1 = la primera), solo en maniobras
     *  type 'roundabout'/'rotary'/'roundabout turn'. */
    exit?: number;
  };
  voiceInstructions?: VoiceInstruction[];
  /** Carriles para ESTA maniobra, si Mapbox los da para este tramo —
   *  ausente (no solo vacío) cuando no hay guía de carril que mostrar. */
  lanes?: RouteLane[];
}

export interface RouteData {
  coordinates: [number, number][]; // [lat, lng] for consistency with previous API
  distance: number; // meters
  duration: number; // seconds
  /** Duration (s) of each leg between consecutive waypoints */
  legDurations?: number[];
  /** Distance (m) of each leg between consecutive waypoints — mismo orden
   *  que legDurations, para poder enseñar los km hasta cada parada igual
   *  que ya se enseñan los minutos. */
  legDistances?: number[];
  /** Congestion level per coordinate segment ('low' | 'moderate' | 'heavy' | 'severe' | 'unknown') */
  congestion?: string[];
  /** Límite de velocidad por segmento de coordenadas (mismo criterio que
   *  congestion) — null cuando Mapbox no lo conoce para ese tramo
   *  (carretera sin datos, zona privada...), no cuando no hay límite. */
  maxspeedKmh?: (number | null)[];
  steps?: RouteStep[];
}

export type TravelMode = 'driving' | 'walking' | 'cycling';

interface UseRoutingOptions {
  origin: [number, number] | null; // [lat, lng]
  destination: { lat: number; lng: number } | null;
  /** Optional ordered intermediate waypoints between origin and destination */
  intermediateWaypoints?: Array<{ lat: number; lng: number }>;
  enabled: boolean;
  /** Which Mapbox profile to route with. Defaults to 'driving' (with live traffic). */
  profile?: TravelMode;
}

const MAPBOX_DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox';
// driving-traffic → duraciones y congestión con tráfico real. Los perfiles a
// pie/bici no soportan la anotación de congestión, solo driving-traffic.
const MAPBOX_PROFILE: Record<TravelMode, string> = {
  driving: 'driving-traffic',
  walking: 'walking',
  cycling: 'cycling',
};

/** Recalculate only when the user strays further than this from the route (m). */
const OFF_ROUTE_THRESHOLD_M = 70;
/** Never recalculate more often than this (ms) — bajado de 18s a 7s: al
 *  desviarte, se notaba demasiado tiempo yendo "a ciegas" antes de que la
 *  ruta se actualizara. */
const MIN_RECALC_INTERVAL_MS = 7000;

const EARTH_R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

function distanceMeters(a: [number, number], b: [number, number]) {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

/** Rough min distance from a point to the route polyline (vertex sampling). */
function distanceToRoute(point: [number, number], coords: [number, number][]) {
  let min = Infinity;
  const step = coords.length > 400 ? Math.ceil(coords.length / 400) : 1;
  for (let i = 0; i < coords.length; i += step) {
    const d = distanceMeters(point, coords[i]);
    if (d < min) min = d;
  }
  return min;
}

export function useRouting({ origin, destination, intermediateWaypoints, enabled, profile = 'driving' }: UseRoutingOptions) {
  const [route, setRoute] = useState<RouteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const routeCacheRef = useRef<Map<string, { route: RouteData; ts: number }>>(new Map());
  const routeRef = useRef<RouteData | null>(null);
  const lastFetchTsRef = useRef(0);
  const originRef = useRef<[number, number] | null>(null);
  originRef.current = origin;

  /** Origin actually used for routing — only bumped when a recalc is needed. */
  const [routeOrigin, setRouteOrigin] = useState<[number, number] | null>(null);

  const waypointsKey = (intermediateWaypoints ?? [])
    .map(w => `${w.lat.toFixed(5)},${w.lng.toFixed(5)}`)
    .join('|');
  const destKey = destination ? `${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}` : '';

  // Reset the routing origin whenever the destination or the stops change,
  // or when we first get a position. GPS jitter alone never triggers this.
  useEffect(() => {
    if (!enabled || !destination) {
      setRouteOrigin(null);
      routeRef.current = null;
      return;
    }
    if (originRef.current) setRouteOrigin(originRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, destKey, waypointsKey]);

  useEffect(() => {
    if (!enabled || !destination || !origin) return;
    if (!routeOrigin) {
      setRouteOrigin(origin);
      return;
    }
    const current = routeRef.current;
    if (!current || current.coordinates.length === 0) return;
    if (Date.now() - lastFetchTsRef.current < MIN_RECALC_INTERVAL_MS) return;
    if (distanceToRoute(origin, current.coordinates) > OFF_ROUTE_THRESHOLD_M) {
      setRouteOrigin(origin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, enabled, destination, routeOrigin]);

  const cacheKey = useMemo(() => {
    if (!routeOrigin || !destination) return null;
    return `${profile}|${routeOrigin[0].toFixed(3)},${routeOrigin[1].toFixed(3)}|${destKey}|${waypointsKey}`;
  }, [routeOrigin, destination, destKey, waypointsKey, profile]);

  const fetchRoute = useCallback(async () => {
    if (!routeOrigin || !destination || !enabled) {
      setRoute(null);
      routeRef.current = null;
      return;
    }

    // Serve a recent cached route instantly (< 5 min old)
    if (cacheKey) {
      const cached = routeCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
        routeRef.current = cached.route;
        setRoute(cached.route);
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    setError(null);
    lastFetchTsRef.current = Date.now();

    try {
      // Mapbox expects lng,lat order, semicolon-separated.
      const points: string[] = [`${routeOrigin[1]},${routeOrigin[0]}`];
      for (const wp of intermediateWaypoints ?? []) {
        points.push(`${wp.lng},${wp.lat}`);
      }
      points.push(`${destination.lng},${destination.lat}`);

      // Mapbox exige overview=full cuando se piden datos de congestión
      // (annotations=congestion) — con "simplified" devuelve un 422
      // ("Overview option must be full for congestion"). Como el color de
      // tráfico en la ruta ya es una función pedida y verificada, se
      // mantiene "full" aquí a costa de algo de peso extra en la respuesta.
      // La anotación de congestión solo existe en driving-traffic — a pie/
      // bici Mapbox la ignora o devuelve error, así que se omite fuera de
      // modo coche. maxspeed (para el velocímetro) solo tiene sentido ahí
      // también — a pie/bici no hay límite de velocidad que mostrar.
      const congestionParam = profile === 'driving' ? '&annotations=congestion,maxspeed' : '';
      const url =
        `${MAPBOX_DIRECTIONS_BASE}/${MAPBOX_PROFILE[profile]}/${points.join(';')}` +
        `?geometries=geojson&overview=full&steps=true` +
        `&voice_instructions=true&banner_instructions=true` +
        `${congestionParam}&voice_units=metric` +
        `&language=es&access_token=${MAPBOX_TOKEN}`;

      const response = await fetch(url);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = data?.message ? `: ${data.message}` : '';
        throw new Error(`Failed to fetch route (HTTP ${response.status}${detail})`);
      }
      if (!data?.routes || data.routes.length === 0) throw new Error('No route found');

      const routeData = data.routes[0];

      // GeoJSON [lng, lat] -> [lat, lng]
      const coordinates: [number, number][] = routeData.geometry.coordinates.map(
        (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
      );

      // flatMap across all legs so multi-stop routes (origin → pickup →
      // destination) include the steps from every segment.
      const steps =
        routeData.legs?.flatMap((leg: any) =>
          leg.steps?.map((s: any) => {
            // De entre los varios bannerInstructions de este tramo (cada
            // uno pensado para mostrarse a una distancia distinta), se usa
            // el primero que de verdad traiga guía de carril — vale para
            // todo el tramo, no hace falta elegir por distancia.
            const laneBanner = (s.bannerInstructions ?? []).find(
              (b: any) => Array.isArray(b?.sub?.components) && b.sub.components.some((c: any) => c.type === 'lane'),
            );
            let lanes = laneBanner?.sub.components
              .filter((c: any) => c.type === 'lane')
              .map((c: any) => ({ indications: c.indications ?? [], active: !!c.active }));

            // No todos los tramos traen ese banner (p. ej. una salida de
            // autovía sencilla a veces no lo incluye) aunque Mapbox sí sepa
            // qué carril coger — esa misma info también viaja, siempre,
            // en el último "intersection" del tramo (justo donde está la
            // maniobra). Se usa como respaldo para no perder la guía de
            // carril solo porque falte el banner.
            if (!lanes || lanes.length === 0) {
              const intersectionsWithLanes = (s.intersections ?? []).filter(
                (isec) => Array.isArray(isec.lanes) && isec.lanes.length > 0,
              );
              const lastIntersection = intersectionsWithLanes[intersectionsWithLanes.length - 1];
              if (lastIntersection) {
                // "active" es el carril recomendado; en respuestas antiguas
                // de Mapbox puede faltar, así que si no viene se usa
                // "valid" (carril que sí lleva a seguir la ruta) en su lugar.
                lanes = lastIntersection.lanes.map((l) => ({
                  indications: l.indications ?? [],
                  active: l.active != null ? !!l.active : !!l.valid,
                }));
              }
            }

            return {
              instruction: s.maneuver?.instruction ?? '',
              distance: s.distance,
              duration: s.duration,
              maneuver: {
                type: s.maneuver?.type ?? '',
                modifier: s.maneuver?.modifier,
                location: s.maneuver?.location,
                exit: s.maneuver?.exit,
              },
              voiceInstructions: (s.voiceInstructions ?? []).map((v: any) => ({
                distanceAlongGeometry: v.distanceAlongGeometry ?? 0,
                announcement: v.announcement ?? '',
              })),
              lanes: lanes && lanes.length > 0 ? lanes : undefined,
            };
          }) ?? [],
        ) ?? [];

      // Congestion annotation: one entry per coordinate pair, concatenated
      // across legs so it lines up with the full geometry.
      const congestion: string[] =
        routeData.legs?.flatMap((leg: any) => leg.annotation?.congestion ?? []) ?? [];

      // maxspeed: mismo criterio que congestion (un valor por segmento),
      // pero Mapbox lo manda en mph en vías donde así se señaliza (EEUU,
      // Reino Unido...) — se normaliza todo a km/h para no tener que
      // acordarse de la unidad en cada sitio que lo use. "none" (sin
      // límite, p. ej. un tramo de autobahn) y "unknown" (sin datos) se
      // guardan igual, como null — no hay nada que pintar en rojo si no
      // se sabe cuál es el límite.
      const maxspeedKmh: (number | null)[] =
        routeData.legs?.flatMap((leg: any) =>
          (leg.annotation?.maxspeed ?? []).map((m: any) => {
            if (!m || m.unknown || m.none || typeof m.speed !== 'number') return null;
            return m.unit === 'mph' ? Math.round(m.speed * 1.60934) : m.speed;
          }),
        ) ?? [];

      const newRoute: RouteData = {
        coordinates,
        distance: routeData.distance,
        duration: routeData.duration,
        legDurations: routeData.legs?.map((leg: any) => leg.duration ?? 0) ?? [],
        legDistances: routeData.legs?.map((leg: any) => leg.distance ?? 0) ?? [],
        congestion,
        maxspeedKmh,
        steps,
      };

      if (cacheKey) {
        routeCacheRef.current.set(cacheKey, { route: newRoute, ts: Date.now() });
      }

      routeRef.current = newRoute;
      setRoute(newRoute);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('useRouting: route fetch failed:', message, { routeOrigin, destination });
      setError(message);
      // No straight-line fallback — leave route null so the map draws nothing.
      routeRef.current = null;
      setRoute(null);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeOrigin, destination, enabled, waypointsKey, cacheKey, profile]);

  useEffect(() => { fetchRoute(); }, [fetchRoute]);
  useEffect(() => {
    if (!enabled) {
      setRoute(null);
      routeRef.current = null;
    }
  }, [enabled]);

  return { route, isLoading, error, refetch: fetchRoute };
}
