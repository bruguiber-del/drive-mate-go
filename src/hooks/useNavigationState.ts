import { useState, useCallback, useMemo } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useWaypoints } from '@/hooks/useWaypoints';
import type { RouteData } from '@/hooks/useRouting';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DestinationCoords {
  lat: number;
  lng: number;
  name: string;
}

interface UseNavigationStateOptions {
  /** Called when navigation stops, so callers can clear trip state */
  onStop?: () => void;
  /** From useWaypoints — sets the driver's final destination waypoint */
  setFinalDestination: ReturnType<typeof useWaypoints>['setFinalDestination'];
  /** From useWaypoints — clears all waypoints on cancel */
  cancelTrip: ReturnType<typeof useWaypoints>['cancelTrip'];
}

interface UseNavigationStateReturn {
  // State
  destination: string;
  destinationCoords: DestinationCoords | null;
  isNavigating: boolean;
  enableNavSim: boolean;
  currentRoute: RouteData | null;

  // Derived
  /** { minutes, distanceKm } computed from currentRoute; null when no route */
  dynamicETA: { minutes: number; distanceKm: string } | null;

  // Setters / actions
  handleNavigate: (dest: string, coords: { lng: number; lat: number }) => void;
  handleStopNavigation: () => void;
  setCurrentRoute: (route: RouteData | null) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNavigationState({
  onStop,
  setFinalDestination,
  cancelTrip,
}: UseNavigationStateOptions): UseNavigationStateReturn {
  const { toast } = useToast();

  const [destination, setDestination] = useState('');
  const [destinationCoords, setDestinationCoords] = useState<DestinationCoords | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [enableNavSim, setEnableNavSim] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<RouteData | null>(null);

  // ── handleNavigate ──────────────────────────────────────────────────────────
  const handleNavigate = useCallback(
    (dest: string, coords: { lng: number; lat: number }) => {
      setDestination(dest);
      setDestinationCoords({ ...coords, name: dest });
      setIsNavigating(true);
      setEnableNavSim(true);
      setFinalDestination({ lat: coords.lat, lng: coords.lng, name: dest });
      toast({ title: 'Navegación iniciada', description: `Ruta hacia ${dest}`, duration: 500 });
    },
    [setFinalDestination, toast],
  );

  // ── handleStopNavigation ────────────────────────────────────────────────────
  /**
   * Stops navigation and resets all local state.
   *
   * Also calls `cancelTrip` from useWaypoints to ensure waypoints are cleared
   * immediately, preventing a one-frame stale destination flicker in MapView
   * (which would occur if the waypoint hook cleared asynchronously).
   *
   * `onStop` is called last so parent state resets happen after local state is
   * already consistent.
   */
  const handleStopNavigation = useCallback(() => {
    setIsNavigating(false);
    setEnableNavSim(false);
    setDestination('');
    setDestinationCoords(null);
    setCurrentRoute(null);
    cancelTrip();
    onStop?.();
    toast({ title: 'Navegación detenida', duration: 500 });
  }, [cancelTrip, onStop, toast]);

  // ── dynamicETA ──────────────────────────────────────────────────────────────
  const dynamicETA = useMemo(() => {
    if (!currentRoute) return null;
    return {
      minutes: Math.ceil(currentRoute.duration / 60),
      distanceKm: (currentRoute.distance / 1000).toFixed(1),
    };
  }, [currentRoute]);

  return {
    destination,
    destinationCoords,
    isNavigating,
    enableNavSim,
    currentRoute,
    dynamicETA,
    handleNavigate,
    handleStopNavigation,
    setCurrentRoute,
  };
}
