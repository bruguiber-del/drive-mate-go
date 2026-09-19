import { useState, useCallback, useMemo } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useWaypoints } from '@/hooks/useWaypoints';
import type { RouteData, TravelMode } from '@/hooks/useRouting';

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
  /** True as soon as a destination is set — turns on turn-by-turn banners
   *  and voice guidance immediately, no manual confirmation step. */
  hasStartedDriving: boolean;
  /** True when nav simulation should actually animate the user marker */
  enableNavSim: boolean;
  currentRoute: RouteData | null;
  /** True while a Directions request is in flight — lets the UI show
   *  "Calculando ruta..." instead of leaving the user guessing. */
  isRouteLoading: boolean;
  /** How to route/navigate: coche (con tráfico), a pie o bici. */
  travelMode: TravelMode;
  /** Duration (s) of the very first route computed for the trip, before any
   *  passenger pickup was added as an intermediate stop. */
  originalDuration: number | null;

  // Derived
  /** { minutes, distanceKm } computed from currentRoute; null when no route */
  dynamicETA: { minutes: number; distanceKm: string } | null;
  /** Extra minutes added to the trip by current intermediate stops vs. the
   *  original direct route. Null when not applicable. */
  detourMinutes: number | null;

  // Setters / actions
  handleNavigate: (dest: string, coords: { lng: number; lat: number }, mode?: TravelMode) => void;
  /** Begin moving the user marker along the route (driving simulation) */
  startDriving: () => void;
  handleStopNavigation: () => void;
  setCurrentRoute: (route: RouteData | null) => void;
  setIsRouteLoading: (loading: boolean) => void;
  setTravelMode: (mode: TravelMode) => void;
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
  /**
   * `hasStartedDriving` used to require a separate "Iniciar conducción" tap
   * before turning on turn-by-turn/voice — that made sense back when the
   * marker could be animated along the route in a simulation. With real GPS
   * only, the marker always reflects the actual device position regardless
   * of this flag, so there's no "teleport" risk and no reason to make the
   * user confirm anything: it's set to true the moment a destination is
   * picked (see handleNavigate).
   */
  const [hasStartedDriving, setHasStartedDriving] = useState(false);
  const [currentRoute, setCurrentRouteState] = useState<RouteData | null>(null);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [originalDuration, setOriginalDuration] = useState<number | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>('driving');

  // Simulation disabled for real-GPS MVP. The marker only moves when the
  // device GPS reports a new position via watchPosition.
  const enableNavSim = false;

  // Wrap setCurrentRoute so we capture the very first route duration as the
  // "original" (no-passenger) duration. Reset in handleNavigate/handleStop.
  const setCurrentRoute = useCallback((route: RouteData | null) => {
    setCurrentRouteState(route);
    if (route?.duration) {
      setOriginalDuration(prev => (prev == null ? route.duration : prev));
    }
  }, []);

  // ── handleNavigate ──────────────────────────────────────────────────────────
  const handleNavigate = useCallback(
    (dest: string, coords: { lng: number; lat: number }, mode: TravelMode = 'driving') => {
      setDestination(dest);
      setDestinationCoords({ ...coords, name: dest });
      setTravelMode(mode);
      setIsNavigating(true);
      // Arranca todo de inmediato al poner destino — no hace falta un paso
      // extra de "Iniciar conducción" para confirmar. Con GPS real (no
      // simulado) no hay riesgo de "teletransportar" el marcador al activar
      // esto antes de tiempo, así que no aporta nada exigirlo aparte.
      setHasStartedDriving(true);
      setOriginalDuration(null);
      setFinalDestination({ lat: coords.lat, lng: coords.lng, name: dest });
      toast({ title: `Ruta hacia ${dest}`, duration: 1500 });
    },
    [setFinalDestination, toast],
  );

  const startDriving = useCallback(() => {
    setHasStartedDriving(true);
    toast({ title: 'En marcha', description: 'Navegación activa', duration: 800 });
  }, [toast]);

  // ── handleStopNavigation ────────────────────────────────────────────────────
  const handleStopNavigation = useCallback(() => {
    setIsNavigating(false);
    setHasStartedDriving(false);
    setDestination('');
    setDestinationCoords(null);
    setCurrentRouteState(null);
    setIsRouteLoading(false);
    setOriginalDuration(null);
    setTravelMode('driving');
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

  // Extra minutes vs. the original direct route. Only meaningful when an
  // intermediate stop (pickup) extended the route.
  const detourMinutes = useMemo(() => {
    if (!currentRoute || originalDuration == null) return null;
    const diff = currentRoute.duration - originalDuration;
    if (diff <= 30) return null;
    return Math.ceil(diff / 60);
  }, [currentRoute, originalDuration]);

  return {
    destination,
    destinationCoords,
    isNavigating,
    hasStartedDriving,
    enableNavSim,
    currentRoute,
    isRouteLoading,
    travelMode,
    originalDuration,
    dynamicETA,
    detourMinutes,
    handleNavigate,
    startDriving,
    handleStopNavigation,
    setCurrentRoute,
    setIsRouteLoading,
    setTravelMode,
  };
}
