import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MAPBOX_TOKEN } from '@/lib/mapboxConfig';

export interface VoiceInstruction {
  /** Distance (m) before the maneuver at which this should be announced */
  distanceAlongGeometry: number;
  announcement: string;
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  maneuver: {
    type: string;
    modifier?: string;
    location: [number, number];
  };
  voiceInstructions?: VoiceInstruction[];
}

export interface RouteData {
  coordinates: [number, number][]; // [lat, lng] for consistency with previous API
  distance: number; // meters
  duration: number; // seconds
  /** Duration (s) of each leg between consecutive waypoints */
  legDurations?: number[];
  /** Congestion level per coordinate segment ('low' | 'moderate' | 'heavy' | 'severe' | 'unknown') */
  congestion?: string[];
  steps?: RouteStep[];
}

interface UseRoutingOptions {
  origin: [number, number] | null; // [lat, lng]
  destination: { lat: number; lng: number } | null;
  /** Optional ordered intermediate waypoints between origin and destination */
  intermediateWaypoints?: Array<{ lat: number; lng: number }>;
  enabled: boolean;
}

// driving-traffic → duraciones y congestión con tráfico real
const MAPBOX_DIRECTIONS = 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic';

/** Recalculate only when the user strays further than this from the route (m). */
const OFF_ROUTE_THRESHOLD_M = 70;
/** Never recalculate more often than this (ms). */
const MIN_RECALC_INTERVAL_MS = 18000;

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

export function useRouting({ origin, destination, intermediateWaypoints, enabled }: UseRoutingOptions) {
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
    return `${routeOrigin[0].toFixed(3)},${routeOrigin[1].toFixed(3)}|${destKey}|${waypointsKey}`;
  }, [routeOrigin, destination, destKey, waypointsKey]);

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

      const url =
        `${MAPBOX_DIRECTIONS}/${points.join(';')}` +
        `?geometries=geojson&overview=full&steps=true` +
        `&voice_instructions=true&banner_instructions=true` +
        `&annotations=congestion&voice_units=metric` +
        `&language=es&access_token=${MAPBOX_TOKEN}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch route');

      const data = await response.json();
      if (!data.routes || data.routes.length === 0) throw new Error('No route found');

      const routeData = data.routes[0];

      // GeoJSON [lng, lat] -> [lat, lng]
      const coordinates: [number, number][] = routeData.geometry.coordinates.map(
        (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
      );

      // flatMap across all legs so multi-stop routes (origin → pickup →
      // destination) include the steps from every segment.
      const steps =
        routeData.legs?.flatMap((leg: any) =>
          leg.steps?.map((s: any) => ({
            instruction: s.maneuver?.instruction ?? '',
            distance: s.distance,
            duration: s.duration,
            maneuver: {
              type: s.maneuver?.type ?? '',
              modifier: s.maneuver?.modifier,
              location: s.maneuver?.location,
            },
          })) ?? [],
        ) ?? [];

      const newRoute: RouteData = {
        coordinates,
        distance: routeData.distance,
        duration: routeData.duration,
        legDurations: routeData.legs?.map((leg: any) => leg.duration ?? 0) ?? [],
        steps,
      };

      if (cacheKey) {
        routeCacheRef.current.set(cacheKey, { route: newRoute, ts: Date.now() });
      }

      routeRef.current = newRoute;
      setRoute(newRoute);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      // No straight-line fallback — leave route null so the map draws nothing.
      routeRef.current = null;
      setRoute(null);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeOrigin, destination, enabled, waypointsKey, cacheKey]);

  useEffect(() => { fetchRoute(); }, [fetchRoute]);
  useEffect(() => {
    if (!enabled) {
      setRoute(null);
      routeRef.current = null;
    }
  }, [enabled]);

  return { route, isLoading, error, refetch: fetchRoute };
}
