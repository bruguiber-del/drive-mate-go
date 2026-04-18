import { useState, useEffect, useCallback } from 'react';

export interface RouteData {
  coordinates: [number, number][];
  distance: number; // meters
  duration: number; // seconds
}

interface UseRoutingOptions {
  origin: [number, number] | null;
  destination: { lat: number; lng: number } | null;
  /** Optional ordered intermediate waypoints between origin and destination */
  intermediateWaypoints?: Array<{ lat: number; lng: number }>;
  enabled: boolean;
}

// Use OSRM public API for routing (free, no API key needed)
const OSRM_API = 'https://router.project-osrm.org/route/v1/driving';

export function useRouting({ origin, destination, intermediateWaypoints, enabled }: UseRoutingOptions) {
  const [route, setRoute] = useState<RouteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable serialization for waypoints to keep useCallback identity steady
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
      // OSRM expects coordinates as lng,lat (opposite of Leaflet's lat,lng)
      const points: string[] = [`${origin[1]},${origin[0]}`];
      for (const wp of intermediateWaypoints ?? []) {
        points.push(`${wp.lng},${wp.lat}`);
      }
      points.push(`${destination.lng},${destination.lat}`);

      const url = `${OSRM_API}/${points.join(';')}?overview=full&geometries=geojson`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch route');
      }

      const data = await response.json();

      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error('No route found');
      }

      const routeData = data.routes[0];

      // Convert GeoJSON coordinates [lng, lat] to Leaflet format [lat, lng]
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
      // Fallback to straight line if routing fails
      setRoute({
        coordinates: [origin, [destination.lat, destination.lng]],
        distance: 0,
        duration: 0,
      });
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, enabled, waypointsKey]);

  // Fetch route when dependencies change
  useEffect(() => {
    fetchRoute();
  }, [fetchRoute]);

  // Clear route when disabled
  useEffect(() => {
    if (!enabled) {
      setRoute(null);
    }
  }, [enabled]);

  return {
    route,
    isLoading,
    error,
    refetch: fetchRoute,
  };
}
