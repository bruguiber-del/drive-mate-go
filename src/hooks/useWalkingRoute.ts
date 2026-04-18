import { useState, useEffect, useCallback } from 'react';
import type { RouteData } from './useRouting';
import { MAPBOX_TOKEN } from '@/lib/mapboxConfig';

const MAPBOX_WALKING = 'https://api.mapbox.com/directions/v5/mapbox/walking';

interface UseWalkingRouteOptions {
  origin: [number, number] | null;
  destination: { lat: number; lng: number } | null;
  enabled: boolean;
}

export function useWalkingRoute({ origin, destination, enabled }: UseWalkingRouteOptions) {
  const [route, setRoute] = useState<RouteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRoute = useCallback(async () => {
    if (!origin || !destination || !enabled) {
      setRoute(null);
      return;
    }

    setIsLoading(true);
    try {
      const originStr = `${origin[1]},${origin[0]}`;
      const destStr = `${destination.lng},${destination.lat}`;
      const url =
        `${MAPBOX_WALKING}/${originStr};${destStr}` +
        `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error('Walking route failed');

      const data = await res.json();
      if (!data.routes?.length) throw new Error('No walking route');

      const r = data.routes[0];
      const coordinates: [number, number][] = r.geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]] as [number, number]
      );

      setRoute({ coordinates, distance: r.distance, duration: r.duration });
    } catch {
      setRoute(null);
    } finally {
      setIsLoading(false);
    }
  }, [origin, destination, enabled]);

  useEffect(() => { fetchRoute(); }, [fetchRoute]);
  useEffect(() => { if (!enabled) setRoute(null); }, [enabled]);

  return { route, isLoading, refetch: fetchRoute };
}
