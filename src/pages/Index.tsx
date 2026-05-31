import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, Settings, Locate, X, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

// ── UI Components ──────────────────────────────────────────────────────────────
import MapView from '@/components/MapView';
import DriverToggle from '@/components/DriverToggle';
import SearchBar from '@/components/SearchBar';
import NavigationSearch from '@/components/NavigationSearch';
import PassengerCard from '@/components/PassengerCard';
import PassengerSearch from '@/components/PassengerSearch';
import DriverSettingsSheet from '@/components/DriverSettingsSheet';
import PassengerSettingsSheet from '@/components/PassengerSettingsSheet';
import MatchPopup from '@/components/MatchPopup';
import SettingsMenu from '@/components/SettingsMenu';
import ProfileSection from '@/components/ProfileSection';
import TripHistory from '@/components/TripHistory';
import WalletSection from '@/components/WalletSection';
import HelpSection from '@/components/HelpSection';
import ActiveTripView from '@/components/ActiveTripView';
import RatingModal from '@/components/RatingModal';

// ── Hooks ─────────────────────────────────────────────────────────────────────
import { useDriverTracking } from '@/hooks/useDriverTracking';
import { useWaypoints, type TripLeg } from '@/hooks/useWaypoints';
import { useWalkingRoute } from '@/hooks/useWalkingRoute';
import { usePassengerSimulation } from '@/hooks/usePassengerSimulation';
// useNavigationSimulation removed: real GPS only for MVP
import { useTripLifecycle } from '@/hooks/useTripLifecycle';
import { useNavigationState } from '@/hooks/useNavigationState';
import { useUIModals } from '@/hooks/useUIModals';

// ─── Constants ────────────────────────────────────────────────────────────────

const LEG_LABELS: Record<TripLeg, string> = {
  to_meeting_point: 'Punto de encuentro',
  to_pickup: 'Recogida',
  to_dropoff: 'Bajada pasajero',
  to_destination: 'Destino',
};

// ─── Component ────────────────────────────────────────────────────────────────

const Index = () => {
  const { toast } = useToast();

  // ── Driver mode & settings ──────────────────────────────────────────────────
  const [isDriverMode, setIsDriverMode] = useState(false);
  const [driverSettings, setDriverSettings] = useState({ seats: 3, maxDetour: 5 });
  const [isDoorToDoor, setIsDoorToDoor] = useState(false);
  const [hasActivePassengerSearch, setHasActivePassengerSearch] = useState(false);
  const [realUserLocation, setRealUserLocation] = useState<[number, number] | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // ── Modal / section visibility ──────────────────────────────────────────────
  const modals = useUIModals();

  // ── Waypoints ───────────────────────────────────────────────────────────────
  const waypoints = useWaypoints();
  const {
    currentLeg,
    currentTarget,
    routeWaypoints,
    hasPassenger,
    cancelTrip,
    setFinalDestination,
  } = waypoints;

  // ── Cross-hook bridge: nav.onStop must call trip.handleTripEnd which is
  //    declared after nav. Use a ref to break the cycle without TDZ issues.
  const tripEndRef = useRef<() => void>(() => {});

  // ── Navigation state ────────────────────────────────────────────────────────
  const nav = useNavigationState({
    setFinalDestination,
    cancelTrip,
    onStop: () => tripEndRef.current(),
  });

  // ── Passenger simulation ────────────────────────────────────────────────────
  // Forward-declared via ref to use trip.showActiveTrip without TDZ.
  const showActiveTripRef = useRef(false);
  const passengerSimEnabledEarly =
    isDriverMode && nav.isNavigating && !modals.showMatchPopup && !showActiveTripRef.current;

  const {
    currentPassenger: simulatedPassenger,
    dismissCurrent: dismissSimPassenger,
  } = usePassengerSimulation({
    enabled: passengerSimEnabledEarly,
    userLocation: realUserLocation,
    intervalMs: 12000,
    driverRoute: nav.currentRoute?.coordinates ?? null,
    driverDestination: nav.destinationCoords,
  });

  // ── Trip lifecycle ──────────────────────────────────────────────────────────
  const trip = useTripLifecycle({
    isDriverMode,
    simulatedPassenger,
    realUserLocation,
    isDoorToDoor,
    dismissSimPassenger,
    waypointControls: {
      addPassengerWaypoints: waypoints.addPassengerWaypoints,
      addMeetingPointWaypoints: waypoints.addMeetingPointWaypoints,
      confirmMeetingPointArrival: waypoints.confirmMeetingPointArrival,
      confirmPickup: waypoints.confirmPickup,
      completeTrip: waypoints.completeTrip,
      cancelTrip: waypoints.cancelTrip,
      currentLeg,
    },
  });

  // Keep the bridge ref pointing at the latest handleTripEnd
  useEffect(() => {
    tripEndRef.current = trip.handleTripEnd;
  }, [trip.handleTripEnd]);

  // Listen for GPS permission denial and surface a toast
  useEffect(() => {
    const handler = () => {
      toast({
        title: 'Ubicación denegada',
        description: 'Activa los permisos de ubicación para usar VIMATCH correctamente.',
        variant: 'destructive',
      });
    };
    window.addEventListener('vimatch:gps-denied', handler);
    return () => window.removeEventListener('vimatch:gps-denied', handler);
  }, [toast]);

  // Unified flag — single source of truth for passenger simulation gating
  const passengerSimEnabled =
    isDriverMode && nav.isNavigating && !trip.showActiveTrip && !modals.showMatchPopup;

  // Keep the ref in sync so the early gate above also sees showActiveTrip
  useEffect(() => {
    showActiveTripRef.current = trip.showActiveTrip;
  }, [trip.showActiveTrip]);

  // ── Navigation simulation DISABLED for real-GPS MVP ────────────────────────
  // The user marker must move only when the real device GPS reports a new
  // position. We keep the values as null to avoid any synthetic movement.
  const simulatedPosition = null;
  const simulatedHeading = null;

  // ── Driver real-time tracking ──────────────────────────────────────────────
  const { driverLocation, locationHistory } = useDriverTracking({
    tripId: trip.activeTripId,
    isDriver: trip.activeTripRole === 'driver',
    enabled: trip.showActiveTrip,
  });

  // ── Walking route (passenger → meeting point) ──────────────────────────────
  const passengerWalkingEnabled =
    trip.activeTripRole === 'passenger' &&
    trip.meetingPoint !== null &&
    trip.showActiveTrip &&
    !isDoorToDoor;

  const { route: walkingRouteData } = useWalkingRoute({
    origin: realUserLocation,
    destination: trip.meetingPoint
      ? { lat: trip.meetingPoint.lat, lng: trip.meetingPoint.lng }
      : null,
    enabled: passengerWalkingEnabled,
  });

  // ── Open match popup when a new simulated passenger appears ────────────────
  const prevPassengerIdRef = useRef('');
  useEffect(() => {
    if (
      passengerSimEnabled &&
      simulatedPassenger &&
      simulatedPassenger.id !== prevPassengerIdRef.current
    ) {
      prevPassengerIdRef.current = simulatedPassenger.id;
      modals.openMatchPopup();
      setShowPreview(true);
    }
  }, [simulatedPassenger, passengerSimEnabled, modals]);

  // ── Derived: match data for MatchPopup ─────────────────────────────────────
  const currentMatchData = useMemo(() => {
    if (!simulatedPassenger) return undefined;
    return {
      userName: simulatedPassenger.name,
      rating: simulatedPassenger.rating,
      detourMinutes: simulatedPassenger.detourMinutes,
      compensation: simulatedPassenger.compensation,
      pickupDistance: simulatedPassenger.pickupDistance,
      acceptsPets: simulatedPassenger.acceptsPets,
      hasChildSeat: simulatedPassenger.hasChildSeat,
      doorToDoor: simulatedPassenger.doorToDoor,
      doorToDoorSurcharge: simulatedPassenger.doorToDoor ? 1.2 : 0,
      tripPrice: simulatedPassenger.compensation,
      origin: simulatedPassenger.origin.name,
      destination: simulatedPassenger.destination.name,
    };
  }, [simulatedPassenger]);

  // ── Derived: preview waypoints shown on map during match popup ─────────────
  const previewWaypoints = useMemo(() => {
    if (!showPreview || !simulatedPassenger) return undefined;
    return [
      {
        lat: simulatedPassenger.origin.lat,
        lng: simulatedPassenger.origin.lng,
        type: 'pickup' as const,
        name: 'Recogida',
      },
      {
        lat: simulatedPassenger.destination.lat,
        lng: simulatedPassenger.destination.lng,
        type: 'dropoff' as const,
        name: simulatedPassenger.destination.name,
      },
    ];
  }, [showPreview, simulatedPassenger]);

  // ── Derived: active map destination ──────────────────────────────────────
  // When a trip is active, the route's *destination* is always the final
  // destination; pickups/meeting points are inserted as intermediate stops so
  // the polyline goes: driver → pickup → final_destination.
  const finalDestinationWaypoint = useMemo(
    () => routeWaypoints.find(w => w.type === 'final_destination'),
    [routeWaypoints],
  );

  const mapDestination = useMemo(() => {
    if (finalDestinationWaypoint) {
      return {
        lat: finalDestinationWaypoint.lat,
        lng: finalDestinationWaypoint.lng,
        name: finalDestinationWaypoint.name,
      };
    }
    if (currentTarget) {
      return { lat: currentTarget.lat, lng: currentTarget.lng, name: currentTarget.name };
    }
    return nav.destinationCoords;
  }, [finalDestinationWaypoint, currentTarget, nav.destinationCoords]);

  // Intermediate stops to insert in the routing call (everything except final)
  const intermediateRouteWaypoints = useMemo(
    () => {
      const wps = routeWaypoints
        .filter(w => w.type !== 'final_destination')
        .map(w => ({ lat: w.lat, lng: w.lng }));
      console.log('intermediateRouteWaypoints:', wps, 'routeWaypoints:', routeWaypoints);
      return wps;
    },
    [routeWaypoints],
  );

  // ── Derived: waypoint markers for map ──────────────────────────────────────
  const mapWaypointMarkers = useMemo(
    () => routeWaypoints.map(w => ({ lat: w.lat, lng: w.lng, type: w.type, name: w.name })),
    [routeWaypoints],
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleDriverToggle = useCallback(() => {
    setIsDriverMode(prev => {
      if (!prev) {
        toast({
          title: 'Modo conductor activado',
          description: 'Navega a tu destino y aparecerán pasajeros cercanos',
        });
      }
      return !prev;
    });
  }, [toast]);

  const handleMatchAcceptAndClose = useCallback(() => {
    setShowPreview(false);
    modals.closeMatchPopup();
    trip.handleMatchAccept();
  }, [modals, trip]);

  const handleMatchReject = useCallback(() => {
    setShowPreview(false);
    modals.closeMatchPopup();
    dismissSimPassenger();
    toast({ title: 'Solicitud rechazada', description: 'Seguirás recibiendo nuevas solicitudes' });
  }, [modals, dismissSimPassenger, toast]);

  const handlePassengerSearch = useCallback(
    (data: { destination: string }) => {
      setHasActivePassengerSearch(true);
      toast({ title: 'Buscando conductores...', description: `Hacia ${data.destination}` });
      setTimeout(() => {
        modals.openMatchPopup();
        setHasActivePassengerSearch(false);
      }, 2000);
    },
    [modals, toast],
  );

  const showDriverOnMap = trip.showActiveTrip && trip.activeTripRole === 'passenger';

  // ── Current navigation step (turn-by-turn) ──────────────────────────────────
  const currentStep = useMemo(() => {
    const steps = nav.currentRoute?.steps;
    if (!steps?.length || !realUserLocation) return null;
    let closest = steps[0];
    let minDist = Infinity;
    for (const step of steps) {
      const loc = step.maneuver?.location;
      if (!loc) continue;
      const [lng, lat] = loc;
      const dLat = lat - realUserLocation[0];
      const dLng = lng - realUserLocation[1];
      const d = dLat * dLat + dLng * dLng;
      if (d < minDist) {
        minDist = d;
        closest = step;
      }
    }
    return closest;
  }, [nav.currentRoute, realUserLocation]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen w-screen overflow-hidden">
      <MapView
        destination={mapDestination}
        showRoute={nav.isNavigating || (trip.showActiveTrip && trip.activeTripRole === 'driver')}
        driverLocation={driverLocation}
        driverLocationHistory={locationHistory}
        showDriverMarker={showDriverOnMap}
        isNavigating={nav.isNavigating}
        waypointMarkers={mapWaypointMarkers}
        intermediateRouteWaypoints={intermediateRouteWaypoints}
        walkingRoute={passengerWalkingEnabled ? walkingRouteData : null}
        onRouteUpdate={nav.setCurrentRoute}
        simulatedPosition={null}
        simulatedHeading={null}
        onUserLocationUpdate={setRealUserLocation}
        previewWaypoints={previewWaypoints}
      >
        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 p-4 safe-area-inset-top pointer-events-none">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center gap-3"
          >
            <Button
              variant="glass"
              size="icon"
              className="shrink-0 pointer-events-auto"
              onClick={modals.openSettingsMenu}
            >
              <Menu className="w-5 h-5" />
            </Button>

            <div className="flex-1 pointer-events-auto">
              <SearchBar
                onClick={() => !nav.isNavigating && modals.openNavigationSearch()}
                destination={nav.destination}
                isNavigating={nav.isNavigating}
              />
            </div>

            {nav.isNavigating && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="pointer-events-auto">
                <Button variant="destructive" size="icon" onClick={nav.handleStopNavigation}>
                  <X className="w-5 h-5" />
                </Button>
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* Logo */}
        <AnimatePresence>
          {!nav.isNavigating && !trip.showActiveTrip && (
            <motion.div
              className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ delay: 0.4 }}
            >
              <h1 className="text-3xl font-extrabold tracking-tight">
                <span className="text-gradient">VI</span>
                <span className="text-foreground">MATCH</span>
              </h1>
              <p className="text-center text-sm text-muted-foreground mt-1">El navegador social</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Driver Status Chip */}
        {isDriverMode && !trip.showActiveTrip && (
          <motion.div
            className="absolute top-20 right-4 pointer-events-none z-10"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="glass-strong rounded-full px-3 py-1.5 flex items-center gap-1.5 border border-success/30">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-[11px] font-medium text-foreground">Conductor activo</span>
              <span className="text-[11px] text-muted-foreground">
                · {driverSettings.seats} plazas · +{driverSettings.maxDetour} min
              </span>
            </div>
          </motion.div>
        )}

        {/* Driver navigation chip */}
        {trip.showActiveTrip && trip.activeTripRole === 'driver' && hasPassenger && (
          <motion.div
            className="absolute top-20 left-4 right-4 pointer-events-none z-10"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="glass-strong rounded-xl px-3 py-2 flex items-center gap-2 border border-primary/20">
              <Navigation className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-foreground">{LEG_LABELS[currentLeg]}</span>
                {currentTarget && (
                  <span className="text-xs text-muted-foreground ml-1 truncate">· {currentTarget.name}</span>
                )}
              </div>
              {nav.dynamicETA && (
                <div className="text-right shrink-0">
                  <span className="text-sm font-bold text-primary">{nav.dynamicETA.minutes} min</span>
                  <span className="text-[10px] text-muted-foreground ml-1">{nav.dynamicETA.distanceKm} km</span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Turn-by-turn navigation banner */}
        {nav.isNavigating && nav.hasStartedDriving && currentStep && (
          <motion.div
            className="absolute top-20 left-4 right-4 pointer-events-none z-10"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="glass-strong rounded-xl px-4 py-3 flex items-center gap-3 border border-primary/30 bg-background/90">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <Navigation className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground leading-tight">
                  {currentStep.instruction}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  En {currentStep.distance < 1000
                    ? `${Math.round(currentStep.distance)}m`
                    : `${(currentStep.distance / 1000).toFixed(1)}km`}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Passenger walking info */}
        {trip.showActiveTrip && trip.activeTripRole === 'passenger' && trip.meetingPoint && !isDoorToDoor && walkingRouteData && (
          <motion.div
            className="absolute top-32 left-4 right-4 pointer-events-none z-10"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="glass-strong rounded-xl px-3 py-2 flex items-center gap-2 border border-[hsl(280,70%,55%)]/30">
              <span className="text-lg">🚶</span>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-foreground">Camina al punto de encuentro</span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-sm font-bold" style={{ color: 'hsl(280,70%,55%)' }}>
                  {Math.ceil(walkingRouteData.duration / 60)} min
                </span>
                <span className="text-[10px] text-muted-foreground ml-1">
                  {(walkingRouteData.distance / 1000).toFixed(1)} km
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Passenger Card */}
        {!trip.showActiveTrip && (
          <motion.div
            className="absolute top-20 left-4 pointer-events-auto"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            <PassengerCard
              onClick={modals.openPassengerSearch}
              hasActiveSearch={hasActivePassengerSearch}
            />
          </motion.div>
        )}

        {/* "Iniciar conducción" CTA — only when route exists but user hasn't moved yet */}
        {nav.isNavigating && !nav.hasStartedDriving && !trip.showActiveTrip && (
          <motion.div
            className="absolute bottom-28 left-4 right-4 pointer-events-auto z-20"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
          >
            <Button
              variant="default"
              size="lg"
              className="w-full shadow-float"
              onClick={nav.startDriving}
            >
              <Navigation className="w-5 h-5 mr-2" />
              Iniciar conducción
            </Button>
          </motion.div>
        )}

        {/* Unified Bottom Bar */}
        {!trip.showActiveTrip && (
          <motion.div
            className="absolute bottom-0 left-0 right-0 p-3 pb-6 safe-area-inset-bottom pointer-events-none"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center gap-2 pointer-events-auto">
              <DriverToggle isDriver={isDriverMode} onToggle={handleDriverToggle} />

              {isDriverMode && (
                <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}>
                  <Button variant="glass" size="icon" className="w-9 h-9" onClick={modals.openDriverSettings}>
                    <Settings className="w-4 h-4" />
                  </Button>
                </motion.div>
              )}

              {nav.isNavigating && nav.dynamicETA ? (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex-1 min-w-0">
                  <div className="glass-strong rounded-lg px-2 py-1.5 flex items-center gap-2">
                    <Navigation className="w-3 h-3 text-primary shrink-0" />
                    <span className="text-xs text-foreground truncate">{nav.destination}</span>
                    <span className="text-xs font-bold text-primary shrink-0">· {nav.dynamicETA.minutes} min</span>
                  </div>
                </motion.div>
              ) : (
                <div className="flex-1" />
              )}

              <div className="flex flex-col gap-1">
                <Button variant="glass" size="icon" className="w-8 h-8" onClick={() => (window as any).__mapZoomIn?.()}>
                  <span className="text-sm font-bold text-foreground">+</span>
                </Button>
                <Button variant="glass" size="icon" className="w-8 h-8" onClick={() => (window as any).__mapZoomOut?.()}>
                  <span className="text-sm font-bold text-foreground">−</span>
                </Button>
                <Button variant="glass" size="icon" className="w-8 h-8" onClick={() => (window as any).__mapCenterOnUser?.()}>
                  <Locate className="w-4 h-4 text-primary" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </MapView>

      {/* Active Trip View */}
      <AnimatePresence>
        <ActiveTripView
          isOpen={trip.showActiveTrip}
          onClose={trip.handleTripEnd}
          userRole={trip.activeTripRole}
          tripStatus={trip.tripStatus}
          onPickup={trip.handlePickup}
        />
      </AnimatePresence>

      {/* Modals */}
      <NavigationSearch
        isOpen={modals.showNavigationSearch}
        onClose={modals.closeNavigationSearch}
        onNavigate={nav.handleNavigate}
      />

      <PassengerSearch
        isOpen={modals.showPassengerSearch}
        onClose={modals.closePassengerSearch}
        onSearch={handlePassengerSearch}
        onOpenSettings={() => {
          modals.closePassengerSearch();
          modals.openPassengerSettings();
        }}
      />

      <PassengerSettingsSheet
        isOpen={modals.showPassengerSettings}
        onClose={modals.closePassengerSettings}
        onSave={(settings) => {
          setIsDoorToDoor(settings.doorToDoor);
          toast({ title: 'Preferencias aplicadas', description: 'Tus preferencias se usarán en la búsqueda' });
        }}
      />

      <DriverSettingsSheet
        isOpen={modals.showDriverSettings}
        onClose={modals.closeDriverSettings}
        onSave={(settings) => {
          setDriverSettings({ seats: settings.seats, maxDetour: settings.maxDetour });
          toast({ title: 'Ajustes guardados', description: `${settings.seats} plazas, desvío máx. ${settings.maxDetour} min` });
        }}
      />

      <MatchPopup
        isOpen={modals.showMatchPopup}
        onAccept={handleMatchAcceptAndClose}
        onReject={handleMatchReject}
        isDriverView={isDriverMode}
        matchData={currentMatchData}
      />

      <SettingsMenu
        isOpen={modals.showSettingsMenu}
        onClose={modals.closeSettingsMenu}
        onNavigate={modals.handleMenuNavigate}
      />

      <ProfileSection isOpen={modals.showProfile} onClose={modals.closeProfile} />
      <TripHistory isOpen={modals.showHistory} onClose={modals.closeHistory} />
      <WalletSection isOpen={modals.showWallet} onClose={modals.closeWallet} />
      <HelpSection isOpen={modals.showHelp} onClose={modals.closeHelp} />

      <RatingModal
        isOpen={trip.showRating}
        onClose={trip.closeRating}
        onSubmit={() => {
          toast({ title: '¡Gracias por tu valoración!', description: 'Has obtenido un 10% de descuento en tu próximo viaje' });
        }}
        userName="Ana M."
        tripInfo="Huesca → Zaragoza"
      />
    </div>
  );
};

export default Index;
