import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, Settings, Locate, X, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
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
import { useDriverTracking } from '@/hooks/useDriverTracking';
import { useWaypoints } from '@/hooks/useWaypoints';
import { useWalkingRoute } from '@/hooks/useWalkingRoute';
import { usePassengerSimulation } from '@/hooks/usePassengerSimulation';
import { useNavigationSimulation } from '@/hooks/useNavigationSimulation';
import type { RouteData } from '@/hooks/useRouting';

const Index = () => {
  const { toast } = useToast();
  const [isDriverMode, setIsDriverMode] = useState(false);
  const [showNavigationSearch, setShowNavigationSearch] = useState(false);
  const [showPassengerSearch, setShowPassengerSearch] = useState(false);
  const [showDriverSettings, setShowDriverSettings] = useState(false);
  const [showPassengerSettings, setShowPassengerSettings] = useState(false);
  const [showMatchPopup, setShowMatchPopup] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [destination, setDestination] = useState('');
  const [destinationCoords, setDestinationCoords] = useState<{ lng: number; lat: number; name: string } | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [hasActivePassengerSearch, setHasActivePassengerSearch] = useState(false);
  
  // Section states
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showActiveTrip, setShowActiveTrip] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [activeTripRole, setActiveTripRole] = useState<'driver' | 'passenger'>('passenger');
  const [tripStatus, setTripStatus] = useState<'waiting' | 'picked_up' | 'in_progress'>('waiting');
  
  // Driver settings
  const [driverSettings, setDriverSettings] = useState({ seats: 3, maxDetour: 5 });

  // Trip ID for real-time tracking
  const [activeTripId, setActiveTripId] = useState<string | null>(null);

  // Dynamic route data from MapView
  const [currentRoute, setCurrentRoute] = useState<RouteData | null>(null);

  // Meeting point for non-door-to-door trips
  const [meetingPoint, setMeetingPoint] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [isDoorToDoor, setIsDoorToDoor] = useState(false);

  // Real user location from MapView
  const [realUserLocation, setRealUserLocation] = useState<[number, number] | null>(null);

  // Navigation simulation
  const [enableNavSim, setEnableNavSim] = useState(false);

  // Waypoints system
  const {
    waypoints,
    currentLeg,
    currentTarget,
    routeWaypoints,
    hasPassenger,
    addPassengerWaypoints,
    addMeetingPointWaypoints,
    setFinalDestination,
    confirmMeetingPointArrival,
    confirmPickup,
    confirmDropoff,
    completeTrip,
    cancelTrip,
  } = useWaypoints();

  // Real-time driver tracking
  const { driverLocation, locationHistory } = useDriverTracking({
    tripId: activeTripId,
    isDriver: activeTripRole === 'driver',
    enabled: showActiveTrip,
  });

  // Passenger simulation (generates nearby passengers in driver mode)
  const {
    currentPassenger: simulatedPassenger,
    dismissCurrent: dismissSimPassenger,
    acceptCurrent: acceptSimPassenger,
  } = usePassengerSimulation({
    enabled: isDriverMode && isNavigating && !showActiveTrip && !showMatchPopup,
    userLocation: realUserLocation,
    intervalMs: 12000,
  });

  // Navigation simulation (animate along route)
  const { simulatedPosition, simulatedHeading } = useNavigationSimulation({
    routeCoordinates: currentRoute?.coordinates ?? null,
    enabled: enableNavSim && isNavigating,
    speedMultiplier: 20,
  });

  // Walking route for passenger (to meeting point)
  const passengerWalkingEnabled = activeTripRole === 'passenger' && meetingPoint !== null && showActiveTrip && !isDoorToDoor;
  const { route: walkingRouteData } = useWalkingRoute({
    origin: null,
    destination: meetingPoint ? { lat: meetingPoint.lat, lng: meetingPoint.lng } : null,
    enabled: passengerWalkingEnabled,
  });

  // Dynamic ETA from current route
  const dynamicETA = useMemo(() => {
    if (!currentRoute) return null;
    const mins = Math.ceil(currentRoute.duration / 60);
    const km = (currentRoute.distance / 1000).toFixed(1);
    return { minutes: mins, distanceKm: km };
  }, [currentRoute]);

  // Current navigation destination (from waypoints or direct)
  const activeDestination = useMemo(() => {
    if (currentTarget) {
      return { lat: currentTarget.lat, lng: currentTarget.lng, name: currentTarget.name };
    }
    return destinationCoords;
  }, [currentTarget, destinationCoords]);

  // Waypoint markers for map visualization
  const mapWaypointMarkers = useMemo(() => {
    return routeWaypoints.map(w => ({
      lat: w.lat,
      lng: w.lng,
      type: w.type,
      name: w.name,
    }));
  }, [routeWaypoints]);

  // Current leg label
  const legLabel = useMemo(() => {
    switch (currentLeg) {
      case 'to_meeting_point': return 'Punto de encuentro';
      case 'to_pickup': return 'Recogida';
      case 'to_dropoff': return 'Bajada pasajero';
      case 'to_destination': return 'Destino';
    }
  }, [currentLeg]);

  // Show match popup when simulated passenger appears
  const prevPassengerRef = useMemo(() => ({ id: '' }), []);
  useMemo(() => {
    if (simulatedPassenger && simulatedPassenger.id !== prevPassengerRef.id) {
      prevPassengerRef.id = simulatedPassenger.id;
      setShowMatchPopup(true);
    }
  }, [simulatedPassenger, prevPassengerRef]);

  // Match data from simulated passenger
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
      doorToDoorSurcharge: simulatedPassenger.doorToDoor ? 1.20 : 0,
      tripPrice: simulatedPassenger.compensation,
      origin: simulatedPassenger.origin.name,
      destination: simulatedPassenger.destination.name,
    };
  }, [simulatedPassenger]);

  // Preview waypoints for map (before accepting)
  const previewWaypoints = useMemo(() => {
    if (!showMatchPopup || !simulatedPassenger) return undefined;
    return [
      { lat: simulatedPassenger.origin.lat, lng: simulatedPassenger.origin.lng, type: 'pickup' as const, name: 'Recogida' },
      { lat: simulatedPassenger.destination.lat, lng: simulatedPassenger.destination.lng, type: 'dropoff' as const, name: simulatedPassenger.destination.name },
    ];
  }, [showMatchPopup, simulatedPassenger]);

    setIsDriverMode(!isDriverMode);
    if (!isDriverMode) {
      toast({
        title: "Modo conductor activado",
        description: "Navega a tu destino y aparecerán pasajeros cercanos",
      });
      // Don't force match popup; simulation will handle it
    }
  };

  const handleNavigate = (dest: string, coords: { lng: number; lat: number }) => {
    setDestination(dest);
    setDestinationCoords({ ...coords, name: dest });
    setIsNavigating(true);
    setEnableNavSim(true);
    setFinalDestination({ lat: coords.lat, lng: coords.lng, name: dest });
    toast({ title: "Navegación iniciada", description: `Ruta hacia ${dest}`, duration: 500 });
  };

  const handleStopNavigation = () => {
    setIsNavigating(false);
    setEnableNavSim(false);
    setDestination('');
    setDestinationCoords(null);
    cancelTrip();
    setMeetingPoint(null);
    toast({ title: "Navegación detenida", duration: 500 });
  };

  const handlePassengerSearch = (data: any) => {
    setHasActivePassengerSearch(true);
    toast({ title: "Buscando conductores...", description: `Hacia ${data.destination}` });
    setTimeout(() => {
      setShowMatchPopup(true);
      setHasActivePassengerSearch(false);
    }, 2000);
  };

  const handlePassengerAcceptDriver = () => {
    setShowMatchPopup(false);
    setActiveTripRole('passenger');
    setTripStatus('waiting');
    const newTripId = crypto.randomUUID();
    setActiveTripId(newTripId);
    setShowActiveTrip(true);

    // Simulate meeting point for non-door-to-door
    if (!isDoorToDoor) {
      // In production, this would come from the meeting point calculator
      const simulatedMeetingPoint = { lat: 42.1380, lng: -0.4100, name: 'Punto de encuentro' };
      setMeetingPoint(simulatedMeetingPoint);
      toast({
        title: "¡Viaje confirmado!",
        description: "Camina al punto de encuentro. Tu conductor también se dirige allí.",
      });
    } else {
      toast({
        title: "¡Viaje confirmado!",
        description: "Tu conductor viene a recogerte.",
      });
    }
  };

  const handleMatchAccept = () => {
    setShowMatchPopup(false);
    const newTripId = crypto.randomUUID();
    setActiveTripId(newTripId);
    
    if (isDriverMode) {
      setActiveTripRole('driver');

      // Simulate passenger waypoints
      const simulatedPickup = { lat: 42.1380, lng: -0.4100, name: 'Recogida pasajero' };
      const simulatedDropoff = { lat: 42.0500, lng: -0.5000, name: 'Bajada pasajero' };

      if (!isDoorToDoor) {
        // Calculate meeting point on route (simulated)
        const simulatedMeetingPt = { lat: 42.1370, lng: -0.4090, name: 'Punto de encuentro' };
        setMeetingPoint(simulatedMeetingPt);
        addMeetingPointWaypoints(simulatedMeetingPt, simulatedDropoff);
        toast({
          title: "¡Viaje aceptado!",
          description: "Dirígete al punto de encuentro para recoger al pasajero.",
        });
      } else {
        addPassengerWaypoints(simulatedPickup, simulatedDropoff);
        toast({
          title: "¡Viaje aceptado!",
          description: "Tu ubicación se compartirá con el pasajero en tiempo real.",
        });
      }
    } else {
      setActiveTripRole('passenger');
      handlePassengerAcceptDriver();
      return;
    }
    
    setTripStatus('waiting');
    setShowActiveTrip(true);
  };

  const handlePickup = () => {
    if (currentLeg === 'to_meeting_point') {
      confirmMeetingPointArrival();
      toast({ title: "¡Pasajero recogido!", description: "Continuando hacia bajada del pasajero" });
    } else {
      confirmPickup();
      toast({ title: "¡Pasajero recogido!", description: "Continuando hacia el destino" });
    }
    setTripStatus('picked_up');
  };

  const handleMatchReject = () => {
    setShowMatchPopup(false);
    toast({ title: "Solicitud rechazada", description: "Seguirás recibiendo nuevas solicitudes" });
  };

  const handleTripEnd = () => {
    setShowActiveTrip(false);
    setTripStatus('waiting');
    setActiveTripId(null);
    setMeetingPoint(null);
    completeTrip();
    setShowRating(true);
  };

  const handleMenuNavigate = (section: string) => {
    switch (section) {
      case 'profile': setShowProfile(true); break;
      case 'history': setShowHistory(true); break;
      case 'wallet': setShowWallet(true); break;
      case 'help': setShowHelp(true); break;
      case 'security': setShowProfile(true); break;
    }
  };

  const showDriverOnMap = showActiveTrip && activeTripRole === 'passenger';

  // Determine what destination to pass to MapView
  const mapDestination = useMemo(() => {
    if (activeDestination) {
      return { lat: activeDestination.lat, lng: activeDestination.lng, name: activeDestination.name };
    }
    return null;
  }, [activeDestination]);

  return (
    <div className="h-screen w-screen overflow-hidden">
      <MapView 
        destination={mapDestination} 
        showRoute={isNavigating}
        driverLocation={driverLocation}
        driverLocationHistory={locationHistory}
        showDriverMarker={showDriverOnMap}
        isNavigating={isNavigating}
        waypointMarkers={mapWaypointMarkers}
        walkingRoute={passengerWalkingEnabled ? walkingRouteData : null}
        onRouteUpdate={setCurrentRoute}
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
              onClick={() => setShowSettingsMenu(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>

            <div className="flex-1 pointer-events-auto">
              <SearchBar 
                onClick={() => !isNavigating && setShowNavigationSearch(true)} 
                destination={destination}
                isNavigating={isNavigating}
              />
            </div>

            {isNavigating && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="pointer-events-auto">
                <Button variant="destructive" size="icon" onClick={handleStopNavigation}>
                  <X className="w-5 h-5" />
                </Button>
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* Logo */}
        <AnimatePresence>
          {!isNavigating && !showActiveTrip && (
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
        {isDriverMode && !showActiveTrip && (
          <motion.div
            className="absolute top-20 right-4 pointer-events-none z-10"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="glass-strong rounded-full px-3 py-1.5 flex items-center gap-1.5 border border-success/30">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-[11px] font-medium text-foreground">Conductor activo</span>
              <span className="text-[11px] text-muted-foreground">· {driverSettings.seats} plazas · +{driverSettings.maxDetour} min</span>
            </div>
          </motion.div>
        )}

        {/* Navigation info chip during active trip */}
        {showActiveTrip && hasPassenger && (
          <motion.div
            className="absolute top-20 left-4 right-4 pointer-events-none z-10"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="glass-strong rounded-xl px-3 py-2 flex items-center gap-2 border border-primary/20">
              <Navigation className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-foreground">{legLabel}</span>
                {currentTarget && (
                  <span className="text-xs text-muted-foreground ml-1 truncate">· {currentTarget.name}</span>
                )}
              </div>
              {dynamicETA && (
                <div className="text-right shrink-0">
                  <span className="text-sm font-bold text-primary">{dynamicETA.minutes} min</span>
                  <span className="text-[10px] text-muted-foreground ml-1">{dynamicETA.distanceKm} km</span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Passenger walking info */}
        {showActiveTrip && activeTripRole === 'passenger' && meetingPoint && !isDoorToDoor && walkingRouteData && (
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
        {!showActiveTrip && (
          <motion.div 
            className="absolute top-20 left-4 pointer-events-auto"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            <PassengerCard 
              onClick={() => setShowPassengerSearch(true)}
              hasActiveSearch={hasActivePassengerSearch}
            />
          </motion.div>
        )}

        {/* Unified Bottom Bar */}
        {!showActiveTrip && (
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
                  <Button variant="glass" size="icon" className="w-9 h-9" onClick={() => setShowDriverSettings(true)}>
                    <Settings className="w-4 h-4" />
                  </Button>
                </motion.div>
              )}

              {isNavigating && dynamicETA ? (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex-1 min-w-0">
                  <div className="glass-strong rounded-lg px-2 py-1.5 flex items-center gap-2">
                    <Navigation className="w-3 h-3 text-primary shrink-0" />
                    <span className="text-xs text-foreground truncate">{destination}</span>
                    <span className="text-xs font-bold text-primary shrink-0">· {dynamicETA.minutes} min</span>
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
          isOpen={showActiveTrip}
          onClose={handleTripEnd}
          userRole={activeTripRole}
          tripStatus={tripStatus}
          onPickup={handlePickup}
        />
      </AnimatePresence>

      {/* Modals */}
      <NavigationSearch 
        isOpen={showNavigationSearch}
        onClose={() => setShowNavigationSearch(false)}
        onNavigate={handleNavigate}
      />

      <PassengerSearch 
        isOpen={showPassengerSearch} 
        onClose={() => setShowPassengerSearch(false)}
        onSearch={handlePassengerSearch}
        onOpenSettings={() => {
          setShowPassengerSearch(false);
          setShowPassengerSettings(true);
        }}
      />

      <PassengerSettingsSheet
        isOpen={showPassengerSettings}
        onClose={() => setShowPassengerSettings(false)}
        onSave={(settings) => {
          setIsDoorToDoor(settings.doorToDoor);
          toast({ title: "Preferencias aplicadas", description: "Tus preferencias se usarán en la búsqueda" });
        }}
      />
      
      <DriverSettingsSheet 
        isOpen={showDriverSettings} 
        onClose={() => setShowDriverSettings(false)}
        onSave={(settings) => {
          setDriverSettings({ seats: settings.seats, maxDetour: settings.maxDetour });
          toast({ title: "Ajustes guardados", description: `${settings.seats} plazas, desvío máx. ${settings.maxDetour} min` });
        }}
      />

      <MatchPopup 
        isOpen={showMatchPopup}
        onAccept={handleMatchAccept}
        onReject={handleMatchReject}
        isDriverView={isDriverMode}
      />

      <SettingsMenu 
        isOpen={showSettingsMenu}
        onClose={() => setShowSettingsMenu(false)}
        onNavigate={handleMenuNavigate}
      />

      <ProfileSection isOpen={showProfile} onClose={() => setShowProfile(false)} />
      <TripHistory isOpen={showHistory} onClose={() => setShowHistory(false)} />
      <WalletSection isOpen={showWallet} onClose={() => setShowWallet(false)} />
      <HelpSection isOpen={showHelp} onClose={() => setShowHelp(false)} />

      <RatingModal
        isOpen={showRating}
        onClose={() => setShowRating(false)}
        onSubmit={() => {
          toast({ title: "¡Gracias por tu valoración!", description: "Has obtenido un 10% de descuento en tu próximo viaje" });
        }}
        userName="Ana M."
        tripInfo="Huesca → Zaragoza"
      />
    </div>
  );
};

export default Index;
