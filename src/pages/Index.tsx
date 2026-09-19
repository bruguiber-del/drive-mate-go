import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import { AnimatePresence } from "framer-motion";
import { getManeuverIcon } from "@/lib/maneuverIcons";
import { useVoiceGuidance } from "@/hooks/useVoiceGuidance";
import { useToast } from "@/components/ui/use-toast";

// ── UI Components ──────────────────────────────────────────────────────────────
// Mapbox GL is heavy — load it lazily so the rest of the UI paints immediately.
import { ErrorBoundary } from "@/components/ErrorBoundary";
const MapView = lazy(() => import("@/components/MapView"));
import NavTopBar from "@/components/NavTopBar";
import NavigationOverlays from "@/components/NavigationOverlays";
import BottomActionBar from "@/components/BottomActionBar";
import NavigationSearch from "@/components/NavigationSearch";
import DriverSettingsSheet from "@/components/DriverSettingsSheet";
import PassengerSettingsSheet, { type PassengerSettingsData } from "@/components/PassengerSettingsSheet";
import { supabase } from "@/integrations/supabase/client";
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
import { useWaypoints } from "@/hooks/useWaypoints";
import { useWalkingRoute } from "@/hooks/useWalkingRoute";
import { usePassengerSimulation, type SimulatedPassenger } from "@/hooks/usePassengerSimulation";
import { calculatePrice } from "@/lib/priceCalculator";
// useNavigationSimulation removed: real GPS only for MVP
import { useTripLifecycle } from "@/hooks/useTripLifecycle";
import { useNavigationState } from "@/hooks/useNavigationState";
import { useUIModals } from "@/hooks/useUIModals";
import { useVehicles } from "@/hooks/useVehicles";
import { useDriverSimulation } from "@/hooks/useDriverSimulation";

// ─── Component ────────────────────────────────────────────────────────────────

const Index = () => {
  const { toast } = useToast();

  // ── Driver mode & settings ──────────────────────────────────────────────────
  const [isDriverMode, setIsDriverMode] = useState(false);
  const [driverSettings, setDriverSettings] = useState({ seats: 3, maxDetour: 5 });
  const [isDoorToDoor, setIsDoorToDoor] = useState(false);
  const [isPassengerMode, setIsPassengerMode] = useState(false);
  const [realUserLocation, setRealUserLocation] = useState<[number, number] | null>(null);
  /** Origen editable, viaje para otra persona y programación (PassengerSettingsSheet) */
  const [passengerTripSetup, setPassengerTripSetup] = useState<{
    originText: string;
    isForOther: boolean;
    otherPersonName: string;
    otherPersonPickup: string;
    scheduledAt: string | null;
  }>({ originText: "", isForOther: false, otherPersonName: "", otherPersonPickup: "", scheduledAt: null });
  /** Tick para reevaluar si ya llegó la hora del viaje programado */
  const [scheduleTick, setScheduleTick] = useState(0);
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

  // Surface Directions API failures — antes fallaban en silencio, sin
  // ninguna pista de por qué no aparecía la ruta.
  const lastRouteErrorRef = useRef<string | null>(null);
  const handleRouteError = useCallback(
    (error: string | null) => {
      if (error === lastRouteErrorRef.current) return;
      lastRouteErrorRef.current = error;
      if (!error) return;
      toast({
        title: "No se pudo calcular la ruta",
        description: error,
        variant: "destructive",
      });
    },
    [toast],
  );

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
    setIsPassengerMode(false);
    driverSim.clearDriver();
    setIsDriverMode(true);
    toast({
      title: "Modo conductor activado",
      description: vehicles.activeVehicle
        ? `Usando ${vehicles.activeVehicle.brand} ${vehicles.activeVehicle.model} · ${vehicles.activeVehicle.licensePlate}`
        : "Navega a tu destino y aparecerán pasajeros cercanos",
    });
  }, [vehicles.activeVehicle, toast, driverSim]);

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

  // ── Guardado de ajustes del pasajero (origen, para otra persona, programar) ─
  const handlePassengerSettingsSave = useCallback(
    async (settings: PassengerSettingsData) => {
      setIsDoorToDoor(settings.doorToDoor);
      setPassengerTripSetup({
        originText: settings.originText,
        isForOther: settings.isForOther,
        otherPersonName: settings.otherPersonName,
        otherPersonPickup: settings.otherPersonPickup,
        scheduledAt: settings.scheduledAt,
      });

      if (settings.scheduledAt) {
        // Guarda el viaje programado en la nube si hay sesión iniciada
        try {
          const { data: userData } = await supabase.auth.getUser();
          const uid = userData?.user?.id;
          if (uid) {
            await supabase.from("trips").insert({
              driver_id: uid,
              passenger_id: uid,
              status: "scheduled",
              scheduled_at: settings.scheduledAt,
              origin_name: settings.originText || null,
              origin_lat: realUserLocation?.[0] ?? null,
              origin_lng: realUserLocation?.[1] ?? null,
              destination_name: nav.destination || null,
              destination_lat: nav.destinationCoords?.lat ?? null,
              destination_lng: nav.destinationCoords?.lng ?? null,
            });
          }
        } catch {
          /* el viaje programado sigue funcionando en local si falla la nube */
        }
        const when = new Date(settings.scheduledAt).toLocaleString("es-ES", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        toast({ title: "Viaje programado", description: `Buscaremos conductor cerca de las ${when}` });
        return;
      }

      toast({ title: "Preferencias aplicadas", description: "Tus preferencias se usarán en la búsqueda" });
    },
    [toast, realUserLocation, nav.destination, nav.destinationCoords],
  );



  // ── Viaje programado: no buscar conductor hasta que se acerque la hora ──────
  const SCHEDULE_LEAD_MS = 5 * 60 * 1000;
  const isScheduledPending = useMemo(() => {
    void scheduleTick;
    const iso = passengerTripSetup.scheduledAt;
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return !isNaN(t) && t - Date.now() > SCHEDULE_LEAD_MS;
  }, [passengerTripSetup.scheduledAt, scheduleTick, SCHEDULE_LEAD_MS]);

  useEffect(() => {
    if (!passengerTripSetup.scheduledAt) return;
    const id = setInterval(() => setScheduleTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, [passengerTripSetup.scheduledAt]);

  // ── Driver search while in passenger mode (mirrors passenger simulation) ────
  const driverSearchEnabled = isPassengerMode && nav.isNavigating && !trip.showActiveTrip && !isScheduledPending;
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
        // Con pasajero a bordo el conductor siempre va en coche, sin importar
        // qué modo tuviera seleccionado en su última búsqueda personal.
        travelMode={trip.showActiveTrip && trip.activeTripRole === "driver" ? "driving" : nav.travelMode}
        waypointMarkers={mapWaypointMarkers}
        intermediateRouteWaypoints={intermediateRouteWaypoints}
        walkingRoute={trip.activeTripRole === "passenger" && passengerWalkingEnabled ? walkingRouteData : null}
        onRouteUpdate={nav.setCurrentRoute}
        onRouteError={handleRouteError}
        onRouteLoadingChange={nav.setIsRouteLoading}
        simulatedPosition={null}
        simulatedHeading={null}
        onUserLocationUpdate={setRealUserLocation}
        previewWaypoints={previewWaypoints}
      >
        {/* Top Bar */}
        <NavTopBar
          onOpenMenu={modals.openSettingsMenu}
          onOpenSearch={modals.openNavigationSearch}
          destination={nav.destination}
          isNavigating={nav.isNavigating}
          travelMode={nav.travelMode}
          isRouteLoading={nav.isRouteLoading}
          hasKnownLocation={!!realUserLocation}
          isMuted={voice.isMuted}
          onToggleMuted={voice.toggleMuted}
          onStopNavigation={handleStopNavigation}
        />

        <NavigationOverlays
          isNavigating={nav.isNavigating}
          showActiveTrip={trip.showActiveTrip}
          isDriverMode={isDriverMode}
          activeTripRole={trip.activeTripRole}
          hasPassenger={hasPassenger}
          hasStartedDriving={nav.hasStartedDriving}
          currentStep={currentStep}
          ManeuverIcon={ManeuverIcon}
          currentLeg={currentLeg}
          currentTargetName={currentTarget?.name ?? null}
          dynamicETA={nav.dynamicETA}
          detourMinutes={nav.detourMinutes}
          driverSeats={driverSettings.seats}
          driverMaxDetour={driverSettings.maxDetour}
          activeVehiclePlate={vehicles.activeVehicle?.licensePlate}
          isDoorToDoor={isDoorToDoor}
          hasMeetingPoint={trip.meetingPoint !== null}
          walkingRouteData={walkingRouteData}
        />


        <BottomActionBar
          showStartDrivingCta={nav.isNavigating && !nav.hasStartedDriving && !trip.showActiveTrip}
          onStartDriving={nav.startDriving}
          showBar={!trip.showActiveTrip}
          isDriverMode={isDriverMode}
          onDriverToggle={handleDriverToggle}
          onOpenDriverSettings={modals.openDriverSettings}
          isPassengerMode={isPassengerMode}
          onPassengerToggle={handlePassengerToggle}
          onOpenPassengerSettings={modals.openPassengerSettings}
          isNavigating={nav.isNavigating}
          dynamicETA={nav.dynamicETA}
          destination={nav.destination}
        />
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
        travelMode={nav.travelMode}
        onTravelModeChange={nav.setTravelMode}
      />


      <PassengerSettingsSheet
        isOpen={modals.showPassengerSettings}
        onClose={modals.closePassengerSettings}
        userLocation={realUserLocation}
        onSave={handlePassengerSettingsSave}
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
