import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, Settings, Locate, X, Navigation, Volume2, VolumeX } from "lucide-react";
import { getManeuverIcon } from "@/lib/maneuverIcons";
import { useVoiceGuidance } from "@/hooks/useVoiceGuidance";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

// ── UI Components ──────────────────────────────────────────────────────────────
// Mapbox GL is heavy — load it lazily so the rest of the UI paints immediately.
import { ErrorBoundary } from "@/components/ErrorBoundary";
const MapView = lazy(() => import("@/components/MapView"));
import DriverToggle from "@/components/DriverToggle";
import SearchBar from "@/components/SearchBar";
import NavigationSearch from "@/components/NavigationSearch";
import PassengerToggle from "@/components/PassengerToggle";
import DriverSettingsSheet from "@/components/DriverSettingsSheet";
import PassengerSettingsSheet from "@/components/PassengerSettingsSheet";
import MatchPopup from "@/components/MatchPopup";
import SettingsMenu from "@/components/SettingsMenu";
import ProfileSection from "@/components/ProfileSection";
import TripHistory from "@/components/TripHistory";
import WalletSection from "@/components/WalletSection";
import HelpSection from "@/components/HelpSection";
import ActiveTripView from "@/components/ActiveTripView";
import RatingModal from "@/components/RatingModal";
import VehicleManager from "@/components/VehicleManager";

// ── Hooks ─────────────────────────────────────────────────────────────────────
import { useDriverTracking } from "@/hooks/useDriverTracking";
import { useWaypoints, type TripLeg } from "@/hooks/useWaypoints";
import { useWalkingRoute } from "@/hooks/useWalkingRoute";
import { usePassengerSimulation, type SimulatedPassenger } from "@/hooks/usePassengerSimulation";
import { calculatePrice } from "@/lib/priceCalculator";
// useNavigationSimulation removed: real GPS only for MVP
import { useTripLifecycle } from "@/hooks/useTripLifecycle";
import { useNavigationState } from "@/hooks/useNavigationState";
import { useUIModals } from "@/hooks/useUIModals";
import { useVehicles } from "@/hooks/useVehicles";
import { useDriverSimulation } from "@/hooks/useDriverSimulation";

// ─── Constants ────────────────────────────────────────────────────────────────

const LEG_LABELS: Record<TripLeg, string> = {
  to_meeting_point: "Ve a recoger al pasajero",
  to_pickup: "Ve a recoger al pasajero",
  to_dropoff: "Lleva al pasajero a su destino",
  to_destination: "Continúa a tu destino",
};

// ─── Component ────────────────────────────────────────────────────────────────

const Index = () => {
  const { toast } = useToast();

  // ── Driver mode & settings ──────────────────────────────────────────────────
  const [isDriverMode, setIsDriverMode] = useState(false);
  const [driverSettings, setDriverSettings] = useState({ seats: 3, maxDetour: 5 });
  const [isDoorToDoor, setIsDoorToDoor] = useState(false);
  const [isPassengerMode, setIsPassengerMode] = useState(false);
  const [realUserLocation, setRealUserLocation] = useState<[number, number] | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  /** Passenger the driver accepted — powers the real ActiveTripView data */
  const [acceptedPassenger, setAcceptedPassenger] = useState<SimulatedPassenger | null>(null);

  // ── Vehicles ────────────────────────────────────────────────────────────────
  const vehicles = useVehicles();
  const driverSim = useDriverSimulation();
  const [showVehicleManager, setShowVehicleManager] = useState(false);
  const [vehicleSelectMode, setVehicleSelectMode] = useState<"manage" | "select">("manage");

  // ── Modal / section visibility ──────────────────────────────────────────────
  const modals = useUIModals();

  // ── Waypoints ───────────────────────────────────────────────────────────────
  const waypoints = useWaypoints();
  const { currentLeg, currentTarget, routeWaypoints, hasPassenger, cancelTrip, setFinalDestination } = waypoints;

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
  // Single source of truth. NOTE: deliberately NOT tied to showMatchPopup —
  // the current passenger must stay alive while the popup is open. It is only
  // cleared explicitly via dismissCurrent / acceptCurrent.
  const [activeTripOpen, setActiveTripOpen] = useState(false);
  const passengerSimEnabled = isDriverMode && nav.isNavigating && !activeTripOpen;

  const { currentPassenger: simulatedPassenger, dismissCurrent: dismissSimPassenger } = usePassengerSimulation({
    enabled: passengerSimEnabled && !modals.showMatchPopup,
    userLocation: realUserLocation,
    intervalMs: 12000,
    driverRoute: nav.currentRoute?.coordinates ?? null,
    driverDestination: nav.destinationCoords,
    costPerKm: vehicles.activeVehicle?.costPerKm,
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
        title: "Ubicación denegada",
        description: "Activa los permisos de ubicación para usar VIMATCH correctamente.",
        variant: "destructive",
      });
    };
    window.addEventListener("vimatch:gps-denied", handler);
    return () => window.removeEventListener("vimatch:gps-denied", handler);
  }, [toast]);

  // Keep the state in sync so the gate above also sees showActiveTrip
  useEffect(() => {
    setActiveTripOpen(trip.showActiveTrip);
    if (!trip.showActiveTrip) setAcceptedPassenger(null);
  }, [trip.showActiveTrip]);


  // ── Navigation simulation DISABLED for real-GPS MVP ────────────────────────
  // The user marker must move only when the real device GPS reports a new
  // position. We keep the values as null to avoid any synthetic movement.
  const simulatedPosition = null;
  const simulatedHeading = null;

  // ── Driver real-time tracking ──────────────────────────────────────────────
  const { driverLocation, locationHistory } = useDriverTracking({
    tripId: trip.activeTripId,
    isDriver: trip.activeTripRole === "driver",
    enabled: trip.showActiveTrip,
  });

  // ── Walking route (passenger → meeting point) ──────────────────────────────
  const passengerWalkingEnabled =
    trip.activeTripRole === "passenger" && trip.meetingPoint !== null && trip.showActiveTrip && !isDoorToDoor;

  const { route: walkingRouteData } = useWalkingRoute({
    origin: realUserLocation,
    destination: trip.meetingPoint ? { lat: trip.meetingPoint.lat, lng: trip.meetingPoint.lng } : null,
    enabled: passengerWalkingEnabled,
  });

  // ── Open match popup when a new simulated passenger appears ────────────────
  const prevPassengerIdRef = useRef("");
  useEffect(() => {
    if (passengerSimEnabled && simulatedPassenger && simulatedPassenger.id !== prevPassengerIdRef.current) {
      prevPassengerIdRef.current = simulatedPassenger.id;
      modals.openMatchPopup();
      setShowPreview(true);
    }
  }, [simulatedPassenger, passengerSimEnabled, modals]);

  // ── Derived: match data for MatchPopup ─────────────────────────────────────
  const currentMatchData = useMemo(() => {
    // Passenger mode → show the simulated DRIVER we matched with
    if (!isDriverMode) {
      const d = driverSim.currentDriver;
      if (!d) return undefined;
      return {
        userName: d.name,
        rating: d.rating,
        detourMinutes: d.etaMinutes,
        compensation: d.basePrice,
        pickupDistance: d.distanceLabel,
        acceptsPets: d.acceptsPets,
        hasChildSeat: d.hasChildSeat,
        doorToDoor: isDoorToDoor,
        doorToDoorSurcharge: isDoorToDoor ? 1.2 : 0,
        origin: "Tu ubicación",
        destination: "Tu destino",
        vehicle: d.vehicle,
        etaMinutes: d.etaMinutes,
        basePrice: d.basePrice,
        commissionAmount: d.commission,
        totalPrice: d.totalPrice,
      };
    }
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
  }, [simulatedPassenger, isDriverMode, isDoorToDoor, driverSim.currentDriver]);

  // ── Derived: preview waypoints shown on map during match popup ─────────────
  const previewWaypoints = useMemo(() => {
    if (!showPreview || !simulatedPassenger) return undefined;
    return [
      {
        lat: simulatedPassenger.origin.lat,
        lng: simulatedPassenger.origin.lng,
        type: "pickup" as const,
        name: "Recogida",
      },
      {
        lat: simulatedPassenger.destination.lat,
        lng: simulatedPassenger.destination.lng,
        type: "dropoff" as const,
        name: simulatedPassenger.destination.name,
      },
    ];
  }, [showPreview, simulatedPassenger]);

  // ── Derived: active map destination ──────────────────────────────────────
  // When a trip is active, the route's *destination* is always the final
  // destination; pickups/meeting points are inserted as intermediate stops so
  // the polyline goes: driver → pickup → final_destination.
  const finalDestinationWaypoint = useMemo(
    () => routeWaypoints.find((w) => w.type === "final_destination"),
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
    () => routeWaypoints.filter((w) => w.type !== "final_destination").map((w) => ({ lat: w.lat, lng: w.lng })),
    [routeWaypoints],
  );

  // ── Derived: waypoint markers for map ──────────────────────────────────────
  const mapWaypointMarkers = useMemo(
    () => routeWaypoints.map((w) => ({ lat: w.lat, lng: w.lng, type: w.type, name: w.name })),
    [routeWaypoints],
  );

  // ── Derived: pickup / dropoff ETAs from the multi-leg route ────────────────
  const { pickupEta, dropoffEta } = useMemo(() => {
    const legs = nav.currentRoute?.legDurations ?? [];
    const sumTo = (idx: number) => Math.ceil(legs.slice(0, idx + 1).reduce((a, b) => a + b, 0) / 60);

    const pickupIdx = routeWaypoints.findIndex((w) => w.type === "pickup" || w.type === "meeting_point");
    const dropIdx = routeWaypoints.findIndex((w) => w.type === "dropoff");

    return {
      pickupEta: pickupIdx >= 0 && legs.length > pickupIdx ? sumTo(pickupIdx) : nav.dynamicETA?.minutes,
      dropoffEta: dropIdx >= 0 && legs.length > dropIdx ? sumTo(dropIdx) : undefined,
    };
  }, [nav.currentRoute, nav.dynamicETA, routeWaypoints]);

  // ── Derived: real data for ActiveTripView (driver & passenger) ─────────────
  const activeTripData = useMemo(() => {
    if (trip.activeTripRole === "driver" && acceptedPassenger) {
      const toRad = (d: number) => (d * Math.PI) / 180;
      const R = 6371;
      const dLat = toRad(acceptedPassenger.destination.lat - acceptedPassenger.origin.lat);
      const dLng = toRad(acceptedPassenger.destination.lng - acceptedPassenger.origin.lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(acceptedPassenger.origin.lat)) *
          Math.cos(toRad(acceptedPassenger.destination.lat)) *
          Math.sin(dLng / 2) ** 2;
      const distanceKm = 2 * R * Math.asin(Math.sqrt(a));
      const pricing = calculatePrice({
        distanceKm,
        passengerCount: 1,
        traffic: "normal",
        costPerKm: vehicles.activeVehicle?.costPerKm,
      });
      return {
        otherUser: acceptedPassenger.name,
        otherUserRating: acceptedPassenger.rating,
        origin: acceptedPassenger.origin.name,
        destination: acceptedPassenger.destination.name,
        pickupPoint: trip.meetingPoint?.name ?? acceptedPassenger.origin.name,
        eta: pickupEta ?? nav.dynamicETA?.minutes ?? 0,
        price: pricing.driverIncome,
        acceptsPets: acceptedPassenger.acceptsPets,
        hasChildSeat: acceptedPassenger.hasChildSeat,
      };
    }
    if (trip.activeTripRole === "passenger" && driverSim.currentDriver) {
      return {
        otherUser: driverSim.currentDriver.name,
        otherUserRating: driverSim.currentDriver.rating,
        origin: "Tu ubicación",
        destination: nav.destination || "Tu destino",
        pickupPoint: trip.meetingPoint?.name ?? "Punto de encuentro",
        eta: driverSim.currentDriver.etaMinutes,
        price: driverSim.currentDriver.totalPrice,
      };
    }
    return undefined;
  }, [
    trip.activeTripRole,
    trip.meetingPoint,
    acceptedPassenger,
    vehicles.activeVehicle,
    pickupEta,
    nav.dynamicETA,
    driverSim.currentDriver,
    nav.destination,
  ]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleDriverToggle = useCallback(() => {
    if (!isDriverMode) {
      if (vehicles.vehicles.length === 0) {
        setVehicleSelectMode("manage");
        setShowVehicleManager(true);
        return;
      }
      setVehicleSelectMode("select");
      setShowVehicleManager(true);
    } else {
      setIsDriverMode(false);
    }
  }, [isDriverMode, vehicles.vehicles.length]);

  const handleVehicleSelected = useCallback(() => {
    setShowVehicleManager(false);
    setIsDriverMode(true);
    toast({
      title: "Modo conductor activado",
      description: vehicles.activeVehicle
        ? `Usando ${vehicles.activeVehicle.brand} ${vehicles.activeVehicle.model} · ${vehicles.activeVehicle.licensePlate}`
        : "Navega a tu destino y aparecerán pasajeros cercanos",
    });
  }, [vehicles.activeVehicle, toast]);

  const handleMenuNavigate = useCallback(
    (section: string) => {
      if (section === "vehicles") {
        modals.closeSettingsMenu();
        setVehicleSelectMode("manage");
        setShowVehicleManager(true);
        return;
      }
      modals.handleMenuNavigate(section);
    },
    [modals],
  );

  const handleMatchAcceptAndClose = useCallback(() => {
    setShowPreview(false);
    modals.closeMatchPopup();
    if (isDriverMode && simulatedPassenger) setAcceptedPassenger(simulatedPassenger);
    trip.handleMatchAccept();
  }, [modals, trip, isDriverMode, simulatedPassenger]);

  const handleMatchReject = useCallback(() => {
    setShowPreview(false);
    modals.closeMatchPopup();
    dismissSimPassenger();
    if (!isDriverMode) driverSim.clearDriver();
    toast({ title: "Solicitud rechazada", description: "Seguirás recibiendo nuevas solicitudes" });
  }, [modals, dismissSimPassenger, toast, isDriverMode, driverSim]);

  const handlePassengerToggle = useCallback(() => {
    setIsPassengerMode((prev) => {
      const next = !prev;
      if (next) {
        setIsDriverMode(false);
        toast({
          title: "Modo pasajero activado",
          description: "Elige tu destino arriba y buscaremos un conductor que vaya en esa dirección",
        });
      } else {
        driverSim.clearDriver();
      }
      return next;
    });
  }, [toast, driverSim]);

  // ── Driver search while in passenger mode (mirrors passenger simulation) ────
  const driverSearchEnabled = isPassengerMode && nav.isNavigating && !trip.showActiveTrip;
  useEffect(() => {
    if (!driverSearchEnabled || modals.showMatchPopup || driverSim.currentDriver) return;
    const timer = setTimeout(() => {
      const driver = driverSim.searchDriver();
      toast({
        title: "Conductor encontrado",
        description: `${driver.name} · ${driver.vehicle.brand} ${driver.vehicle.model} · ${driver.vehicle.licensePlate}`,
      });
      modals.openMatchPopup();
    }, 6000);
    return () => clearTimeout(timer);
  }, [driverSearchEnabled, modals, driverSim, toast]);

  const showDriverOnMap = trip.showActiveTrip && trip.activeTripRole === "passenger";

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

  // Icono de flecha según la maniobra actual (tipo Waze)
  const ManeuverIcon = useMemo(
    () => getManeuverIcon(currentStep?.maneuver?.type, currentStep?.maneuver?.modifier),
    [currentStep],
  );

  // ── Guía por voz (Web Speech API) ───────────────────────────────────────────
  const voice = useVoiceGuidance({
    steps: nav.currentRoute?.steps,
    userLocation: realUserLocation,
    enabled: nav.isNavigating && nav.hasStartedDriving,
  });

  const handleStopNavigation = useCallback(() => {
    voice.cancelSpeech();
    nav.handleStopNavigation();
  }, [voice, nav]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen w-screen overflow-hidden">
      <ErrorBoundary>
      <Suspense fallback={<div className="absolute inset-0 bg-background" />}>
      <MapView
        destination={mapDestination}
        showRoute={nav.isNavigating || (trip.showActiveTrip && trip.activeTripRole === "driver")}
        driverLocation={driverLocation}
        driverLocationHistory={locationHistory}
        showDriverMarker={showDriverOnMap}
        isNavigating={nav.isNavigating}
        waypointMarkers={mapWaypointMarkers}
        intermediateRouteWaypoints={intermediateRouteWaypoints}
        walkingRoute={trip.activeTripRole === "passenger" && passengerWalkingEnabled ? walkingRouteData : null}
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

            <div className="flex-1 min-w-0 pointer-events-auto">
              <SearchBar
                onClick={() => !nav.isNavigating && modals.openNavigationSearch()}
                destination={nav.destination}
                isNavigating={nav.isNavigating}
              />
            </div>

            {nav.isNavigating && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="pointer-events-auto flex shrink-0 items-center gap-2"
              >
                <Button
                  variant="glass"
                  size="icon"
                  className="shrink-0"
                  onClick={voice.toggleMuted}
                  aria-label={voice.isMuted ? "Activar voz" : "Silenciar voz"}
                >
                  {voice.isMuted ? (
                    <VolumeX className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-primary" />
                  )}
                </Button>
                <Button className="shrink-0" variant="destructive" size="icon" onClick={handleStopNavigation}>
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
            className="absolute top-24 sm:top-20 right-4 pointer-events-none z-10"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="glass-strong rounded-full px-3 py-1.5 flex items-center gap-1.5 border border-success/30">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-[11px] font-medium text-foreground">Conductor activo</span>
              <span className="text-[11px] text-muted-foreground">
                · {driverSettings.seats} plazas · +{driverSettings.maxDetour} min
                {vehicles.activeVehicle ? ` · ${vehicles.activeVehicle.licensePlate}` : ""}
              </span>
            </div>
          </motion.div>
        )}

        {/* Estado compacto — conductor con pasajero, sin navegación giro a giro */}
        {trip.showActiveTrip && trip.activeTripRole === "driver" && hasPassenger && !(nav.hasStartedDriving && currentStep) && (
          <motion.div
            className="absolute top-24 sm:top-20 left-4 right-4 pointer-events-none z-10"
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
              <div className="text-right shrink-0">
                {nav.dynamicETA && <span className="text-sm font-bold text-primary">{nav.dynamicETA.minutes} min</span>}
                {nav.detourMinutes != null && nav.detourMinutes > 0 && (
                  <span className="text-[10px] text-warning ml-1">+{nav.detourMinutes} min desvío</span>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Turn-by-turn banner — SOLO cuando navegando SIN viaje activo */}
        {nav.isNavigating && nav.hasStartedDriving && !trip.showActiveTrip && currentStep && (
          <motion.div
            className="absolute top-24 sm:top-20 left-4 right-4 pointer-events-none z-10"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="glass-strong rounded-xl px-4 py-3 flex items-center gap-3 border border-primary/30 bg-background/90">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <ManeuverIcon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground leading-tight">{currentStep.instruction}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  En{" "}
                  {currentStep.distance < 1000
                    ? `${Math.round(currentStep.distance)}m`
                    : `${(currentStep.distance / 1000).toFixed(1)}km`}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Aviso unificado — maniobra + fase del viaje activo */}
        {trip.showActiveTrip && trip.activeTripRole === "driver" && nav.hasStartedDriving && currentStep && (
          <motion.div
            className="absolute top-24 sm:top-20 left-4 right-4 pointer-events-none z-10"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="glass-strong rounded-xl px-3 py-2.5 flex items-center gap-2.5 border border-primary/20 bg-background/90">
              <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                <ManeuverIcon className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight truncate">
                  {currentStep.instruction}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 truncate">
                  En {" "}
                  {currentStep.distance < 1000
                    ? `${Math.round(currentStep.distance)}m`
                    : `${(currentStep.distance / 1000).toFixed(1)}km`}
                  <span className="mx-1">·</span>
                  {LEG_LABELS[currentLeg]}
                  {nav.dynamicETA && <span className="text-primary font-semibold"> · {nav.dynamicETA.minutes} min</span>}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Passenger walking chip — SOLO pasajero */}
        {trip.showActiveTrip &&
          trip.activeTripRole === "passenger" &&
          trip.meetingPoint !== null &&
          !isDoorToDoor &&
          walkingRouteData && (
            <motion.div
              className="absolute top-24 sm:top-20 left-4 right-4 pointer-events-none z-10"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="glass-strong rounded-xl px-3 py-2 flex items-center gap-2 border border-[hsl(280,70%,55%)]/30">
                <span className="text-lg">🚶</span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-foreground">Camina al punto de encuentro</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-bold" style={{ color: "hsl(280,70%,55%)" }}>
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
            className="absolute top-24 sm:top-20 left-4 pointer-events-auto"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            <PassengerCard onClick={modals.openPassengerSearch} hasActiveSearch={hasActivePassengerSearch} />
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
            <Button variant="default" size="lg" className="w-full shadow-float" onClick={nav.startDriving}>
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
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                >
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
                <Button
                  variant="glass"
                  size="icon"
                  className="w-8 h-8"
                  onClick={() => (window as any).__mapZoomOut?.()}
                >
                  <span className="text-sm font-bold text-foreground">−</span>
                </Button>
                <Button
                  variant="glass"
                  size="icon"
                  className="w-8 h-8"
                  onClick={() => (window as any).__mapCenterOnUser?.()}
                >
                  <Locate className="w-4 h-4 text-primary" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </MapView>
      </Suspense>
      </ErrorBoundary>

      {/* Active Trip View */}
      <AnimatePresence>
        <ActiveTripView
          isOpen={trip.showActiveTrip}
          onClose={trip.handleTripEnd}
          userRole={trip.activeTripRole}
          tripStatus={trip.tripStatus}
          onPickup={trip.handlePickup}
          pickupEta={pickupEta}
          dropoffEta={dropoffEta}
          driverVehicle={trip.activeTripRole === "passenger" ? driverSim.currentDriver?.vehicle : undefined}
          driverEta={trip.activeTripRole === "passenger" ? driverSim.currentDriver?.etaMinutes : undefined}
          walkingMinutes={
            trip.activeTripRole === "passenger" && walkingRouteData
              ? Math.ceil(walkingRouteData.duration / 60)
              : undefined
          }
          onDriverArrived={trip.handlePickup}
          tripData={activeTripData}
        />
      </AnimatePresence>

      {/* Modals */}
      <NavigationSearch
        isOpen={modals.showNavigationSearch}
        onClose={modals.closeNavigationSearch}
        onNavigate={nav.handleNavigate}
        userLocation={realUserLocation}
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
          toast({ title: "Preferencias aplicadas", description: "Tus preferencias se usarán en la búsqueda" });
        }}
      />

      <DriverSettingsSheet
        isOpen={modals.showDriverSettings}
        onClose={modals.closeDriverSettings}
        onSave={(settings) => {
          setDriverSettings({ seats: settings.seats, maxDetour: settings.maxDetour });
          toast({
            title: "Ajustes guardados",
            description: `${settings.seats} plazas, desvío máx. ${settings.maxDetour} min`,
          });
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
        onNavigate={handleMenuNavigate}
      />

      <ProfileSection isOpen={modals.showProfile} onClose={modals.closeProfile} />
      <TripHistory isOpen={modals.showHistory} onClose={modals.closeHistory} />
      <WalletSection isOpen={modals.showWallet} onClose={modals.closeWallet} />
      <HelpSection isOpen={modals.showHelp} onClose={modals.closeHelp} />

      <RatingModal
        isOpen={trip.showRating}
        onClose={trip.closeRating}
        onSubmit={() => {
          toast({
            title: "¡Gracias por tu valoración!",
            description: "Has obtenido un 10% de descuento en tu próximo viaje",
          });
        }}
        userName="Ana M."
        tripInfo="Huesca → Zaragoza"
      />

      <VehicleManager
        isOpen={showVehicleManager}
        onClose={() => setShowVehicleManager(false)}
        vehicles={vehicles.vehicles}
        activeVehicleId={vehicles.activeVehicleId}
        onAdd={vehicles.addVehicle}
        onRemove={vehicles.removeVehicle}
        onVerify={vehicles.startVerification}
        onSelect={vehicles.selectActiveVehicle}
        mode={vehicleSelectMode}
        onConfirmSelect={handleVehicleSelected}
      />
    </div>
  );
};

export default Index;
