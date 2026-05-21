import { useState, useEffect, useCallback } from 'react';
import { MAPBOX_TOKEN } from '@/lib/mapboxConfig';

export interface RouteData {
  coordinates: [number, number][]; // [lat, lng] for consistency with previous API
  distance: number; // meters
  duration: number; // seconds
  steps?: Array<{
    instruction: string;
    distance: number;
    duration: number;
    maneuver: {
      type: string;
      modifier?: string;
      location: [number, number];
    };
  }>;
}

interface UseRoutingOptions {
  origin: [number, number] | null; // [lat, lng]
  destination: { lat: number; lng: number } | null;
  /** Optional ordered intermediate waypoints between origin and destination */
  intermediateWaypoints?: Array<{ lat: number; lng: number }>;
  enabled: boolean;
}

const MAPBOX_DIRECTIONS = 'https://api.mapbox.com/directions/v5/mapbox/driving';

export function useRouting({ origin, destination, intermediateWaypoints, enabled }: UseRoutingOptions) {
  const [route, setRoute] = useState<RouteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const waypointsKey = (intermediateWaypoints ?? [])
    .map(w => `${w.lat.toFixed(5)},${w.lng.toFixed(5)}`)
    .join('|');

  const fetchRoute = useCallback(async () => {
    if (!origin || !destination || !enabled) {
      setRoute(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Mapbox expects lng,lat order, semicolon-separated.
      const points: string[] = [`${origin[1]},${origin[0]}`];
      for (const wp of intermediateWaypoints ?? []) {
        points.push(`${wp.lng},${wp.lat}`);
      }
      points.push(`${destination.lng},${destination.lat}`);

      console.log('Routing URL points:', points);

      const url =
        `${MAPBOX_DIRECTIONS}/${points.join(';')}` +
        `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch route');

      const data = await response.json();
      if (!data.routes || data.routes.length === 0) throw new Error('No route found');

      const routeData = data.routes[0];

      // GeoJSON [lng, lat] -> [lat, lng]
      const coordinates: [number, number][] = routeData.geometry.coordinates.map(
        (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
      );

      setRoute({
        coordinates,
        distance: routeData.distance,
        duration: routeData.duration,
      });
    } catch (err) {
      console.error('Routing error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      // No straight-line fallback — leave route null so the map draws nothing.
      setRoute(null);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, enabled, waypointsKey]);

  useEffect(() => { fetchRoute(); }, [fetchRoute]);
  useEffect(() => { if (!enabled) setRoute(null); }, [enabled]);

  return { route, isLoading, error, refetch: fetchRoute };
}
