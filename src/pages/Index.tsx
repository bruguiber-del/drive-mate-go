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
import { useWaypoints, type Waypoint, type TripLeg } from "@/hooks/useWaypoints";
import { useWalkingRoute } from "@/hooks/useWalkingRoute";
import { usePassengerSimulation, type SimulatedPassenger } from "@/hooks/usePassengerSimulation";
// useNavigationSimulation removed: real GPS only for MVP
import { useTripLifecycle } from "@/hooks/useTripLifecycle";
import { useMultiPassengerTrip } from "@/hooks/useMultiPassengerTrip";
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
  /** Snapshot of activeTripData taken right before the trip is closed, so
   *  RatingModal shows the real person/trip instead of placeholder data —
   *  by the time it opens, acceptedPassenger/driverSim.currentDriver are
   *  already cleared. */
  const [lastTripSummary, setLastTripSummary] = useState<{ userName: string; tripInfo: string } | null>(null);

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

  // ── Multi-passenger trip engine ─────────────────────────────────────────────
  // Lleva la cuenta de cuántos pasajeros van a bordo/aceptados a la vez (hasta
  // las plazas del vehículo), y libera cada plaza en el momento de la bajada,
  // no al terminar el viaje completo.
  const multiTrip = useMultiPassengerTrip({ seats: driverSettings.seats });

  // ── Passenger simulation ────────────────────────────────────────────────────
  // Single source of truth. NOTE: deliberately NOT tied to showMatchPopup —
  // the current passenger must stay alive while the popup is open. It is only
  // cleared explicitly via dismissCurrent / acceptCurrent.
  // Sigue generando candidatos mientras queden plazas libres, aunque ya haya
  // pasajeros a bordo — antes se cortaba en cuanto había CUALQUIER viaje
  // activo, sin mirar las plazas.
  const passengerSimEnabled = isDriverMode && nav.isNavigating && multiTrip.freeSeats > 0;

  const { currentPassenger: simulatedPassenger, dismissCurrent: dismissSimPassenger } = usePassengerSimulation({
    enabled: passengerSimEnabled && !modals.showMatchPopup,
    userLocation: realUserLocation,
    intervalMs: 12000,
    driverRoute: nav.currentRoute?.coordinates ?? null,
    driverDestination: nav.destinationCoords,
    costPerKm: vehicles.activeVehicle?.costPerKm,
    maxDetourMinutes: driverSettings.maxDetour,
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
        duration: 3500,
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

  // ── Multi-passenger: paradas reales del conductor ───────────────────────────
  // useWaypoints solo modela un par recogida/bajada; con varios pasajeros a
  // la vez la lista de paradas crece y encoge en caliente, así que para el
  // conductor con pasajeros a bordo se sustituye por esto.
  const driverPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    driverPositionRef.current = realUserLocation
      ? { lat: realUserLocation[0], lng: realUserLocation[1] }
      : null;
  }, [realUserLocation]);

  // Se recalcula solo cuando cambia la lista de pasajeros (aceptar/recoger/
  // dejar), no en cada posición GPS — recalcular el orden óptimo en cada
  // tick sería carísimo y además haría que las paradas bailaran sin razón
  // mientras conduces sin haber pasado nada nuevo.
  const multiStops = useMemo(
    () => multiTrip.stops(driverPositionRef.current),
    [multiTrip.stops],
  );

  const multiPassengerWaypoints = useMemo((): Waypoint[] | null => {
    if (trip.activeTripRole !== "driver" || multiTrip.passengers.length === 0) return null;
    const stops: Waypoint[] = multiStops.map((s, i) => ({
      id: `multi-${s.kind}-${i}-${s.passengerIds.join("-")}`,
      type: s.kind,
      lat: s.lat,
      lng: s.lng,
      name: s.label,
      completed: false,
    }));
    if (nav.destinationCoords) {
      stops.push({
        id: "multi-final",
        type: "final_destination",
        lat: nav.destinationCoords.lat,
        lng: nav.destinationCoords.lng,
        name: nav.destinationCoords.name,
        completed: false,
      });
    }
    return stops;
  }, [trip.activeTripRole, multiTrip.passengers.length, multiStops, nav.destinationCoords]);

  const effectiveWaypoints = multiPassengerWaypoints ?? routeWaypoints;

  const effectiveCurrentTarget = multiPassengerWaypoints ? multiPassengerWaypoints[0] ?? null : currentTarget;

  const effectiveCurrentLeg: TripLeg = multiPassengerWaypoints
    ? effectiveCurrentTarget?.type === "pickup"
      ? "to_pickup"
      : effectiveCurrentTarget?.type === "dropoff"
        ? "to_dropoff"
        : "to_destination"
    : currentLeg;

  const effectiveHasPassenger = multiPassengerWaypoints ? true : hasPassenger;

  // Con varios pasajeros, "Finalizar" solo debe cerrar el viaje cuando ya no
  // queda ninguna parada de pasajero pendiente — si queda alguna, el botón
  // debe limitarse a confirmar la parada actual (ver ActiveTripView).
  const effectiveTripStatus: "waiting" | "picked_up" | "in_progress" = multiPassengerWaypoints
    ? effectiveCurrentTarget?.type === "pickup" ? "waiting" : "picked_up"
    : trip.tripStatus;
  const hasMoreStops = !!multiPassengerWaypoints && multiStops.length > 1;
  const nextStopActionLabel = multiStops[0] ? `Dejar a ${multiStops[0].label}` : undefined;

  // ── Derived: active map destination ──────────────────────────────────────
  // When a trip is active, the route's *destination* is always the final
  // destination; pickups/meeting points are inserted as intermediate stops so
  // the polyline goes: driver → pickup → final_destination.
  const finalDestinationWaypoint = useMemo(
    () => effectiveWaypoints.find((w) => w.type === "final_destination"),
    [effectiveWaypoints],
  );

  const mapDestination = useMemo(() => {
    if (finalDestinationWaypoint) {
      return {
        lat: finalDestinationWaypoint.lat,
        lng: finalDestinationWaypoint.lng,
        name: finalDestinationWaypoint.name,
      };
    }
    if (effectiveCurrentTarget) {
      return { lat: effectiveCurrentTarget.lat, lng: effectiveCurrentTarget.lng, name: effectiveCurrentTarget.name };
    }
    return nav.destinationCoords;
  }, [finalDestinationWaypoint, effectiveCurrentTarget, nav.destinationCoords]);

  // Intermediate stops to insert in the routing call (everything except final)
  const intermediateRouteWaypoints = useMemo(
    () => effectiveWaypoints.filter((w) => w.type !== "final_destination").map((w) => ({ lat: w.lat, lng: w.lng })),
    [effectiveWaypoints],
  );

  // ── Derived: waypoint markers for map ──────────────────────────────────────
  const mapWaypointMarkers = useMemo(
    () => effectiveWaypoints.map((w) => ({ lat: w.lat, lng: w.lng, type: w.type, name: w.name })),
    [effectiveWaypoints],
  );

  // ── Derived: pickup / dropoff ETAs from the multi-leg route ────────────────
  const { pickupEta, dropoffEta } = useMemo(() => {
    const legs = nav.currentRoute?.legDurations ?? [];
    const sumTo = (idx: number) => Math.ceil(legs.slice(0, idx + 1).reduce((a, b) => a + b, 0) / 60);

    const pickupIdx = effectiveWaypoints.findIndex((w) => w.type === "pickup" || w.type === "meeting_point");
    const dropIdx = effectiveWaypoints.findIndex((w) => w.type === "dropoff");

    return {
      pickupEta: pickupIdx >= 0 && legs.length > pickupIdx ? sumTo(pickupIdx) : nav.dynamicETA?.minutes,
      dropoffEta: dropIdx >= 0 && legs.length > dropIdx ? sumTo(dropIdx) : undefined,
    };
  }, [nav.currentRoute, nav.dynamicETA, effectiveWaypoints]);

  // Con varios pasajeros, la tarjeta debe mostrar a quien corresponde la
  // PRÓXIMA parada — no siempre el último aceptado, que puede ya estar a
  // bordo esperando la parada de otro.
  const frontStopPassenger = useMemo(() => {
    if (!multiPassengerWaypoints || multiStops.length === 0) return null;
    const frontId = multiStops[0].passengerIds[0];
    return multiTrip.passengers.find((p) => p.passenger.id === frontId)?.passenger ?? null;
  }, [multiPassengerWaypoints, multiStops, multiTrip.passengers]);

  const displayPassenger = frontStopPassenger ?? acceptedPassenger;
  const extraPassengerCount = Math.max(0, multiTrip.passengers.length - 1);

  // ── Derived: real data for ActiveTripView (driver & passenger) ─────────────
  const activeTripData = useMemo(() => {
    if (trip.activeTripRole === "driver" && displayPassenger) {
      return {
        otherUser: displayPassenger.name + (extraPassengerCount > 0 ? ` (+${extraPassengerCount} más)` : ""),
        otherUserRating: displayPassenger.rating,
        origin: displayPassenger.origin.name,
        destination: displayPassenger.destination.name,
        pickupPoint: trip.meetingPoint?.name ?? displayPassenger.origin.name,
        eta: pickupEta ?? nav.dynamicETA?.minutes ?? 0,
        // El mismo precio que se le mostró y aceptó en MatchPopup — antes se
        // volvía a calcular aquí con línea recta y sin desvío, dando un
        // número distinto del que el pasajero había aceptado.
        price: displayPassenger.compensation,
        acceptsPets: displayPassenger.acceptsPets,
        hasChildSeat: displayPassenger.hasChildSeat,
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
    displayPassenger,
    extraPassengerCount,
    pickupEta,
    nav.dynamicETA,
    driverSim.currentDriver,
    nav.destination,
  ]);

  // Guarda quién iba en el viaje justo antes de cerrarlo — acceptedPassenger
  // y driverSim.currentDriver se limpian en el mismo instante en que
  // showActiveTrip pasa a false, así que RatingModal ya no podría leerlos.
  const handleTripEndWithSummary = useCallback(() => {
    if (activeTripData) {
      setLastTripSummary({
        userName: activeTripData.otherUser,
        tripInfo: `${activeTripData.origin} → ${activeTripData.destination}`,
      });
    }
    // Por si se cancela con pasajeros todavía a bordo/pendientes — no deben
    // quedar plazas fantasma ocupadas para el próximo viaje.
    multiTrip.reset();
    trip.handleTripEnd();
  }, [activeTripData, trip, multiTrip]);

  /** Confirma la parada actual (recogida o bajada) de la cola multi-pasajero
   *  y, si es una bajada, libera esa plaza al instante. */
  const handleMultiStopConfirm = useCallback(() => {
    const front = multiStops[0];
    if (!front) return;
    const tripId = trip.activeTripId;

    if (front.kind === "pickup") {
      multiTrip.confirmPickup(front.passengerIds);
      if (tripId) {
        for (const id of front.passengerIds) {
          const tracked = multiTrip.passengers.find((p) => p.passenger.id === id);
          if (!tracked) continue;
          supabase
            .from("trip_passengers")
            .update({ status: "in_car", picked_up_at: new Date().toISOString() })
            .eq("trip_id", tripId)
            .eq("origin_lat", tracked.passenger.origin.lat)
            .eq("origin_lng", tracked.passenger.origin.lng)
            .eq("status", "waiting_pickup")
            .then(() => {}, () => {});
        }
      }
    } else {
      multiTrip.confirmDropoff(front.passengerIds);
      if (tripId) {
        for (const id of front.passengerIds) {
          const tracked = multiTrip.passengers.find((p) => p.passenger.id === id);
          if (!tracked) continue;
          supabase
            .from("trip_passengers")
            .update({ status: "dropped_off", dropped_off_at: new Date().toISOString() })
            .eq("trip_id", tripId)
            .eq("destination_lat", tracked.passenger.destination.lat)
            .eq("destination_lng", tracked.passenger.destination.lng)
            .neq("status", "dropped_off")
            .then(() => {}, () => {});
        }
      }
    }
  }, [multiStops, multiTrip, trip.activeTripId]);

  const handleActiveTripPickupAction = useCallback(() => {
    if (multiPassengerWaypoints) {
      handleMultiStopConfirm();
    } else {
      trip.handlePickup();
    }
  }, [multiPassengerWaypoints, handleMultiStopConfirm, trip]);

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
        duration: 3500,
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
      duration: 1800,
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
    if (isDriverMode && simulatedPassenger) {
      setAcceptedPassenger(simulatedPassenger);
      // Se añade a la cola real de pasajeros a bordo — puede haber ya otro
      // camino a su parada, o incluso ya recogido, sin que esto lo pise.
      multiTrip.acceptPassenger(simulatedPassenger);
    }
    trip.handleMatchAccept();
  }, [modals, trip, isDriverMode, simulatedPassenger, multiTrip]);

  const handleMatchReject = useCallback(() => {
    setShowPreview(false);
    modals.closeMatchPopup();
    dismissSimPassenger();
    if (!isDriverMode) driverSim.clearDriver();
    toast({ title: "Solicitud rechazada", description: "Seguirás recibiendo nuevas solicitudes", duration: 1800 });
  }, [modals, dismissSimPassenger, toast, isDriverMode, driverSim]);

  const handlePassengerToggle = useCallback(() => {
    setIsPassengerMode((prev) => {
      const next = !prev;
      if (next) {
        setIsDriverMode(false);
        toast({
          title: "Modo pasajero activado",
          description: "Elige tu destino arriba y buscaremos un conductor que vaya en esa dirección",
          duration: 1800,
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
        toast({ title: "Viaje programado", description: `Buscaremos conductor cerca de las ${when}`, duration: 1800 });
        return;
      }

      toast({ title: "Preferencias aplicadas", description: "Tus preferencias se usarán en la búsqueda", duration: 1800 });
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
        duration: 1800,
      });
      modals.openMatchPopup();
    }, 6000);
    return () => clearTimeout(timer);
  }, [driverSearchEnabled, modals, driverSim, toast]);

  const showDriverOnMap = trip.showActiveTrip && trip.activeTripRole === "passenger";

  // ── Current navigation step (turn-by-turn) ──────────────────────────────────
  const currentStepIndex = useMemo(() => {
    const steps = nav.currentRoute?.steps;
    if (!steps?.length || !realUserLocation) return -1;
    let closestIdx = 0;
    let minDist = Infinity;
    steps.forEach((step, i) => {
      const loc = step.maneuver?.location;
      if (!loc) return;
      const [lng, lat] = loc;
      const dLat = lat - realUserLocation[0];
      const dLng = lng - realUserLocation[1];
      const d = dLat * dLat + dLng * dLng;
      if (d < minDist) {
        minDist = d;
        closestIdx = i;
      }
    });
    return closestIdx;
  }, [nav.currentRoute, realUserLocation]);

  const currentStep = useMemo(() => {
    const steps = nav.currentRoute?.steps;
    if (!steps?.length || currentStepIndex < 0) return null;
    return steps[currentStepIndex];
  }, [nav.currentRoute, currentStepIndex]);

  // ── ETA en vivo ──────────────────────────────────────────────────────────
  // nav.dynamicETA es la duración TOTAL calculada la primera vez que se pidió
  // la ruta, y solo se refresca si te desvías >70m del trazado — o sea que
  // mientras conduces sin desviarte, el número se queda congelado desde el
  // origen y no baja aunque ya casi hayas llegado (por eso podía mostrar el
  // doble de lo que decía Google Maps a mitad de trayecto). Aquí se suma
  // solo lo que queda desde el tramo actual en vez del viaje completo.
  const liveETA = useMemo(() => {
    const steps = nav.currentRoute?.steps;
    if (!steps?.length || currentStepIndex < 0) return nav.dynamicETA;
    const remaining = steps.slice(currentStepIndex);
    const seconds = remaining.reduce((sum, s) => sum + s.duration, 0);
    const meters = remaining.reduce((sum, s) => sum + s.distance, 0);
    return {
      minutes: Math.ceil(seconds / 60),
      distanceKm: (meters / 1000).toFixed(1),
    };
  }, [nav.currentRoute, currentStepIndex, nav.dynamicETA]);

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
          hasPassenger={effectiveHasPassenger}
          hasStartedDriving={nav.hasStartedDriving}
          currentStep={currentStep}
          ManeuverIcon={ManeuverIcon}
          currentLeg={effectiveCurrentLeg}
          currentTargetName={effectiveCurrentTarget?.name ?? null}
          dynamicETA={liveETA}
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
          dynamicETA={liveETA}
          destination={nav.destination}
        />
      </MapView>
      </Suspense>
      </ErrorBoundary>

      {/* Active Trip View */}
      <AnimatePresence>
        <ActiveTripView
          isOpen={trip.showActiveTrip}
          onClose={handleTripEndWithSummary}
          userRole={trip.activeTripRole}
          tripStatus={effectiveTripStatus}
          onPickup={handleActiveTripPickupAction}
          hasMoreStops={hasMoreStops}
          nextStopLabel={nextStopActionLabel}
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
            duration: 1800,
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
            duration: 1800,
          });
        }}
        userName={lastTripSummary?.userName ?? ""}
        tripInfo={lastTripSummary?.tripInfo ?? ""}
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
