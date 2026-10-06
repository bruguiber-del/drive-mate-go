import { haversineMeters } from "@/lib/geo";
import { useErrandStops } from "@/hooks/useErrandStops";
import { OVERLAY_BOTTOM_PX, overlayBottom } from "@/lib/overlayLayout";
import { buildPassengerStopPills } from "@/lib/passengerStopPills";
import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import { AnimatePresence } from "framer-motion";
import { X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import StopConfirmButtons from "@/components/StopConfirmButtons";
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
import { useFuelPricesAlongRoute } from "@/hooks/useFuelPricesAlongRoute";
import { calculateCostPerKm } from "@/lib/vehiclePricing";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Radio dentro del cual se considera que el conductor ha llegado a su
 *  destino final — mismo orden de magnitud que el umbral de "desviado de
 *  la ruta" que ya usa useRouting. */
const FINAL_ARRIVAL_RADIUS_M = 60;

// ─── Component ────────────────────────────────────────────────────────────────

const Index = () => {
  const { toast } = useToast();

  // ── Driver mode & settings ──────────────────────────────────────────────────
  const [isDriverMode, setIsDriverMode] = useState(false);
  const [driverSettings, setDriverSettings] = useState({
    seats: 3,
    maxDetour: 5,
    acceptsPets: false,
    hasChildSeat: false,
    doorToDoor: true,
    genderPreference: "none" as "none" | "women" | "men",
  });
  /** Lo que el pasajero pidió al buscar conductor — antes se guardaba y no
   *  filtraba nada. */
  const [passengerPreferences, setPassengerPreferences] = useState({
    hasPet: false,
    needsChildSeat: false,
    genderPreference: "none" as "none" | "women" | "men",
  });
  const [isDoorToDoor, setIsDoorToDoor] = useState(false);
  const [isPassengerMode, setIsPassengerMode] = useState(false);
  const [realUserLocation, setRealUserLocation] = useState<[number, number] | null>(null);
  // Solo para colocar paradas personales: se lee la posición actual sin que
  // cada movimiento de GPS reordene la ruta entera.
  const userLocRef = useRef<[number, number] | null>(null);
  userLocRef.current = realUserLocation;
  /** true solo cuando el conductor, sin pasajeros ya a bordo/pendientes, ha
   *  llegado de verdad (por GPS) a su propio destino final — no se pone a
   *  true solo por haber bajado al último pasajero, que puede quedar a
   *  varios km todavía. */
  const [hasArrivedAtFinalDestination, setHasArrivedAtFinalDestination] = useState(false);
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
  /** true desde que se acepta al primer pasajero de esta sesión de conducción
   *  hasta que se pulsa "Finalizar" — a diferencia de
   *  multiTrip.passengers.length > 0, sigue en true aunque ya se haya
   *  bajado al último, para que el botón de abajo pase a "Finalizar" en vez
   *  de volver al comportamiento antiguo de un solo pasajero. */
  const [isMultiPassengerTripActive, setIsMultiPassengerTripActive] = useState(false);
  /** TODOS los pasajeros aceptados en este viaje, acumulado — a diferencia
   *  de multiTrip.passengers, nunca se borra a uno al confirmar su bajada,
   *  para que RatingModal pueda valorarlos a todos aunque ya se hayan
   *  bajado del coche antes de pulsar "Finalizar". */
  const [tripPassengerHistory, setTripPassengerHistory] = useState<SimulatedPassenger[]>([]);
  /** Snapshot tomado justo antes de cerrar el viaje, para que RatingModal
   *  enseñe los datos reales (todos los pasajeros + lo ahorrado) en vez de
   *  placeholders — para entonces acceptedPassenger/driverSim.currentDriver/
   *  multiTrip.passengers ya están vacíos. */
  const [lastTripSummary, setLastTripSummary] = useState<{
    tripInfo: string;
    targets: { id: string; name: string }[];
    totalSaved: number;
  } | null>(null);

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

  // ── Paradas personales (gasolinera, súper...) ───────────────────────────────
  // Añadidas a mano desde el buscador mientras se navega — se insertan en la
  // ruta activa justo antes del destino final (después de cualquier recogida/
  // bajada de pasajero pendiente, para no interponerse en un compromiso ya
  // aceptado) y desaparecen al confirmarlas o cancelarlas a mano.
  /** Modo del buscador de NavigationSearch: 'destination' (por defecto,
   *  sustituye el destino) o 'stop' (añade una parada sin tocarlo). */
  const [searchMode, setSearchMode] = useState<"destination" | "stop">("destination");

  const handleOpenAddStopSearch = useCallback(() => {
    setSearchMode("stop");
    modals.openNavigationSearch();
  }, [modals]);

  const handleOpenDestinationSearch = useCallback(() => {
    setSearchMode("destination");
    modals.openNavigationSearch();
  }, [modals]);

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

  // Precio medio real de combustible entre las gasolineras de la ruta actual
  // (Ministerio, actualizado cada 5 min) — antes el coste por km del
  // vehículo siempre usaba un precio fijo, sin importar lo que costara de
  // verdad la gasolina/el diésel ese día en esa zona.
  const { prices: fuelPricesAlongRoute } = useFuelPricesAlongRoute({
    enabled: isDriverMode && nav.isNavigating,
    routeCoordinates: nav.currentRoute?.coordinates ?? null,
  });

  const liveCostPerKm = useMemo(() => {
    const vehicle = vehicles.activeVehicle;
    if (!vehicle) return undefined;
    const livePricePerLiter =
      vehicle.fuelType === "diesel"
        ? fuelPricesAlongRoute?.dieselA
        : vehicle.fuelType === "gasoline" || vehicle.fuelType === "hybrid"
          ? fuelPricesAlongRoute?.gasoline95
          : null; // eléctrico no depende del precio de la gasolina
    return calculateCostPerKm(
      vehicle.category,
      vehicle.fuelType,
      vehicle.verificationStatus === "verified",
      livePricePerLiter,
    );
  }, [vehicles.activeVehicle, fuelPricesAlongRoute]);

  // Nombres de quien ya va a bordo o pendiente de recoger — para que una
  // solicitud nueva nunca repita el nombre de alguien que ya está en el
  // coche (antes podían coincidir y parecía la misma persona duplicada).
  const activeSimPassengerNames = useMemo(
    () => new Set(multiTrip.passengers.map((p) => p.passenger.name)),
    [multiTrip.passengers],
  );

  // Forma mínima de cada pasajero ya aceptado que necesita el verificador
  // de desvío real (posición de recogida/bajada + si ya está a bordo).
  const activeSimTrackedPassengers = useMemo(
    () =>
      multiTrip.passengers.map(({ passenger, status }) => ({
        id: passenger.id,
        name: passenger.name,
        origin: { lat: passenger.origin.lat, lng: passenger.origin.lng },
        destination: { lat: passenger.destination.lat, lng: passenger.destination.lng },
        status,
      })),
    [multiTrip.passengers],
  );

  const { currentPassenger: simulatedPassenger, dismissCurrent: dismissSimPassenger } = usePassengerSimulation({
    enabled: passengerSimEnabled && !modals.showMatchPopup,
    userLocation: realUserLocation,
    // +10s sobre los 12s que había — llegaban demasiado seguidas.
    intervalMs: 40000,
    driverRoute: nav.currentRoute?.coordinates ?? null,
    driverDestination: nav.destinationCoords,
    costPerKm: liveCostPerKm,
    maxDetourMinutes: driverSettings.maxDetour,
    driverPreferences: {
      acceptsPets: driverSettings.acceptsPets,
      hasChildSeat: driverSettings.hasChildSeat,
      doorToDoor: driverSettings.doorToDoor,
      genderPreference: driverSettings.genderPreference,
    },
    activePassengerNames: activeSimPassengerNames,
    activeTrackedPassengers: activeSimTrackedPassengers,
    // Línea base 100% real (nada de estimaciones): la ruta real actual, ya
    // con las paradas aceptadas, y la ruta original de cero pasajeros —
    // ambas calculadas de verdad por Mapbox, no geometría aproximada.
    seats: driverSettings.seats,
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

  // Limpia el pasajero mostrado en la tarjeta cuando se cierra el viaje.
  useEffect(() => {
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
      tripPrice: simulatedPassenger.compensation,
      origin: simulatedPassenger.origin.name,
      destination: simulatedPassenger.destination.name,
      tripDistanceKm: simulatedPassenger.tripDistanceKm,
      detourKm: simulatedPassenger.detourKm,
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
    if (trip.activeTripRole !== "driver" || !isMultiPassengerTripActive) return null;
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
  }, [trip.activeTripRole, isMultiPassengerTripActive, multiStops, nav.destinationCoords]);

  // Las paradas personales se insertan justo antes del destino final —
  // detrás de cualquier recogida/bajada de pasajero pendiente, para no
  // interponerse en un compromiso ya aceptado, pero antes de llegar al
  // destino. Con eso basta para que tanto el cálculo de ruta
  // (intermediateRouteWaypoints) como los marcadores del mapa
  // (mapWaypointMarkers) las incluyan automáticamente, sin tocar nada más.
  const { extraStops, setExtraStops, addExtraStop: handleAddStop, removeExtraStop: handleRemoveExtraStop, effectiveWaypoints, errandDetours } =
    useErrandStops(multiPassengerWaypoints ?? routeWaypoints, userLocRef);

  const effectiveCurrentTarget = multiPassengerWaypoints ? multiPassengerWaypoints[0] ?? null : currentTarget;

  const effectiveCurrentLeg: TripLeg = multiPassengerWaypoints
    ? effectiveCurrentTarget?.type === "pickup"
      ? "to_pickup"
      : effectiveCurrentTarget?.type === "dropoff"
        ? "to_dropoff"
        : "to_destination"
    : currentLeg;

  const effectiveHasPassenger = multiPassengerWaypoints ? true : hasPassenger;

  // Con varios pasajeros, el botón inferior solo sirve para RECOGER — las
  // bajadas se confirman con los botones apilados a la derecha (uno por
  // pasajero a bordo), no aquí. "Finalizar" solo aparece cuando ya no queda
  // nadie ni por recoger ni por dejar.
  const effectiveTripStatus: "waiting" | "picked_up" | "in_progress" = multiPassengerWaypoints
    ? effectiveCurrentTarget?.type === "pickup"
      ? "waiting"
      : multiTrip.passengers.length === 0
        ? "picked_up"
        : "in_progress"
    : trip.tripStatus;

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

  // acceptedPassenger es un respaldo para el instante en que se acaba de
  // aceptar a alguien y multiStops todavía no se ha recalculado — pero solo
  // tiene sentido MIENTRAS quede algún pasajero de verdad a bordo/pendiente.
  // Sin este "&& multiTrip.passengers.length > 0", en cuanto se bajaba al
  // último pasajero, frontStopPassenger pasaba a null correctamente pero el
  // respaldo devolvía al ÚLTIMO aceptado (ya bajado hace rato), y su nombre
  // y su punto de recogida se quedaban pegados en la tarjeta con un ETA roto.
  const displayPassenger =
    frontStopPassenger ?? (multiTrip.passengers.length > 0 ? acceptedPassenger : null);
  const extraPassengerCount = Math.max(0, multiTrip.passengers.length - 1);

  // Con varios pasajeros a bordo, la compensación del viaje es la suma de
  // TODOS los aceptados en el viaje (tripPassengerHistory), no solo los que
  // quedan a bordo ahora mismo — usar multiTrip.passengers (que se va
  // vaciando a medida que bajas gente) hacía que el total fuera ENCOGIENDO
  // con cada bajada, hasta terminar mostrando solo la del último pasajero
  // en vez de la suma de los tres.
  // Desvío que muestra el aviso: suma de los desvíos ya verificados de cada
  // pasajero a bordo o pendiente — los mismos números que ves en su chapa,
  // en vez de recalcular la ruta entera (que cambia con el tráfico y con las
  // paradas personales).
  const passengerDetourTotal = multiTrip.passengers.reduce((sum, p) => sum + p.passenger.detourMinutes, 0);

  const totalTripCompensation = multiPassengerWaypoints
    ? tripPassengerHistory.reduce((sum, p) => sum + p.compensation, 0)
    : (displayPassenger?.compensation ?? 0);

  // Detecta la llegada real (GPS) al destino final del conductor, solo
  // relevante una vez que ya no queda ningún pasajero a bordo/pendiente —
  // antes se daba el viaje por "completado" en el instante de bajar al
  // último, aunque el conductor todavía tuviera que seguir conduciendo
  // kilómetros hasta su propio destino.
  useEffect(() => {
    if (hasArrivedAtFinalDestination) return;
    if (!multiPassengerWaypoints || multiTrip.passengers.length > 0) return;
    if (!nav.destinationCoords || !realUserLocation) return;
    const distM = haversineMeters(
      realUserLocation[0],
      realUserLocation[1],
      nav.destinationCoords.lat,
      nav.destinationCoords.lng,
    );
    if (distM <= FINAL_ARRIVAL_RADIUS_M) setHasArrivedAtFinalDestination(true);
  }, [hasArrivedAtFinalDestination, multiPassengerWaypoints, multiTrip.passengers, nav.destinationCoords, realUserLocation]);

  // ── Derived: real data for ActiveTripView (driver & passenger) ─────────────
  const activeTripData = useMemo(() => {
    // Ya se bajó a todo el mundo pero todavía no se ha pulsado "Finalizar"
    // — antes esto caía en el "if" de abajo con displayPassenger a null y
    // se enseñaba el marcador de ejemplo ("Ana M." / Huesca), que tampoco
    // tenía sentido. "Viaje completado" solo aparece al llegar de verdad
    // (GPS) al destino final del conductor — bajar al último pasajero no
    // significa que ya no quede nada de trayecto por delante.
    if (trip.activeTripRole === "driver" && multiPassengerWaypoints && multiTrip.passengers.length === 0) {
      return {
        otherUser: hasArrivedAtFinalDestination ? "Viaje completado" : "De camino a tu destino",
        otherUserRating: 0,
        origin: "Tu ubicación",
        destination: nav.destinationCoords?.name ?? "",
        pickupPoint: nav.destinationCoords?.name ?? "",
        eta: hasArrivedAtFinalDestination ? 0 : pickupEta ?? nav.dynamicETA?.minutes ?? 0,
        price: totalTripCompensation,
      };
    }
    if (trip.activeTripRole === "driver" && displayPassenger) {
      return {
        otherUser: displayPassenger.name + (extraPassengerCount > 0 ? ` (+${extraPassengerCount} más)` : ""),
        otherUserRating: displayPassenger.rating,
        origin: displayPassenger.origin.name,
        destination: displayPassenger.destination.name,
        pickupPoint: trip.meetingPoint?.name ?? displayPassenger.origin.name,
        eta: pickupEta ?? nav.dynamicETA?.minutes ?? 0,
        // Suma de todos los pasajeros a bordo — antes mostraba solo el precio
        // de uno, aunque llevaras a varios pagando cada uno su parte.
        price: totalTripCompensation,
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
    multiPassengerWaypoints,
    multiTrip.passengers,
    displayPassenger,
    extraPassengerCount,
    totalTripCompensation,
    pickupEta,
    nav.dynamicETA,
    nav.destinationCoords,
    hasArrivedAtFinalDestination,
    driverSim.currentDriver,
    nav.destination,
  ]);

  // Guarda quién iba en el viaje justo antes de cerrarlo — acceptedPassenger,
  // driverSim.currentDriver y multiTrip.passengers se limpian en el mismo
  // instante en que showActiveTrip pasa a false, así que RatingModal ya no
  // podría leerlos. Para el conductor se usa tripPassengerHistory (TODOS
  // los aceptados, no solo los que quedan a bordo), de donde también sale
  // totalTripCompensation — antes solo se guardaba activeTripData.otherUser,
  // que con varios pasajeros ya solo decía "Viaje completado"/"De camino a
  // tu destino", no un nombre.
  const handleTripEndWithSummary = useCallback(() => {
    const tripInfo = activeTripData ? `${activeTripData.origin} → ${activeTripData.destination}` : "";
    if (trip.activeTripRole === "driver" && tripPassengerHistory.length > 0) {
      setLastTripSummary({
        tripInfo,
        targets: tripPassengerHistory.map((p) => ({ id: p.id, name: p.name })),
        totalSaved: totalTripCompensation,
      });
    } else if (trip.activeTripRole === "passenger" && driverSim.currentDriver) {
      setLastTripSummary({
        tripInfo,
        targets: [{ id: driverSim.currentDriver.id, name: driverSim.currentDriver.name }],
        totalSaved: 0,
      });
    } else {
      setLastTripSummary(null);
    }
    // Por si se cancela con pasajeros todavía a bordo/pendientes — no deben
    // quedar plazas fantasma ocupadas para el próximo viaje.
    multiTrip.reset();
    setPendingStopKeys(new Set());
    setIsMultiPassengerTripActive(false);
    setHasArrivedAtFinalDestination(false);
    setTripPassengerHistory([]);
    trip.handleTripEnd();
  }, [activeTripData, trip, multiTrip, tripPassengerHistory, totalTripCompensation, driverSim.currentDriver]);

  // Cierra el viaje solo al llegar de verdad (GPS) a tu destino — ya no
  // hace falta pulsar "Finalizar" a mano. handleTripEndWithSummary pone
  // hasArrivedAtFinalDestination de vuelta a false, así que este efecto no
  // se repite.
  useEffect(() => {
    if (hasArrivedAtFinalDestination) handleTripEndWithSummary();
  }, [hasArrivedAtFinalDestination, handleTripEndWithSummary]);

  /** Confirma la recogida de la parada actual — las bajadas ya no pasan por
   *  aquí, van por los botones apilados de la derecha (uno por pasajero). */
  const handleMultiStopConfirm = useCallback(() => {
    const front = multiStops[0];
    if (!front || front.kind !== "pickup") return;
    const tripId = trip.activeTripId;

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
  }, [multiStops, multiTrip, trip.activeTripId]);

  // ── Botones de parada, uno por recogida/bajada pendiente ────────────────────
  // Cubre TANTO recogida como bajada — antes solo la bajada pasaba por aquí,
  // así que tocar una chapa "esperando recogida" no daba ningún aviso ni
  // pausa, y un segundo toque reflejo (normal cuando no ves que haya pasado
  // nada) caía sobre la MISMA chapa ya convertida en verde y confirmaba la
  // bajada al instante — parecía "un toque = baja directamente" cuando en
  // realidad eran dos toques distintos sin que el primero se notara.
  const [pendingStopKeys, setPendingStopKeys] = useState<Set<string>>(new Set());

  // ETA acumulado (minutos) hasta cada parada de multiStops, reutilizando
  // los mismos legDurations de la ruta activa que ya se usaban para
  // pickupEta/dropoffEta del objetivo actual — aquí se calcula para TODAS
  // las paradas, no solo la siguiente, porque cada pasajero tiene su
  // propia chapa con su propio "tiempo hasta recogerlo"/"tiempo hasta
  // dejarlo".
  const multiStopEtaMinutes = useMemo(() => {
    const legs = nav.currentRoute?.legDurations ?? [];
    const sumTo = (idx: number) => Math.ceil(legs.slice(0, idx + 1).reduce((a, b) => a + b, 0) / 60);
    return multiStops.map((_, i) => (legs.length > i ? sumTo(i) : undefined));
  }, [multiStops, nav.currentRoute]);

  // Una chapa por pasajero trackeado (no solo la siguiente parada): cada
  // una lleva su propio estado — transparente mientras espera recogida,
  // verde en cuanto sube — y su propio ETA de recogida/bajada, en vez de
  // depender de un único botón genérico para "la siguiente parada".
  const passengerStopPills = useMemo(() => {
    if (!multiPassengerWaypoints) return [];
    // No se filtran los pendientes de confirmar bajada — se quedan en la
    // lista mostrando el spinner (StopConfirmButtons lo hace vía
    // pendingKeys) hasta que confirmDropoff los quita de verdad, en vez de
    // desaparecer de golpe antes de que la animación de "esperando
    // confirmación" llegue a verse.
    return buildPassengerStopPills(multiTrip.passengers, multiStops, multiStopEtaMinutes);
  }, [multiPassengerWaypoints, multiTrip.passengers, multiStops, multiStopEtaMinutes]);

  // Explica el gesto de las chapas UNA sola vez, la primera vez que aparece
  // alguna en el viaje — antes había un texto fijo pegado a la chapa que,
  // con varias a la vez, se solapaba con ellas y salía ilegible. Un toast
  // no ocupa espacio permanente ni puede chocar con nada.
  const hasShownStopHintRef = useRef(false);
  useEffect(() => {
    if (passengerStopPills.length === 0 || hasShownStopHintRef.current) return;
    hasShownStopHintRef.current = true;
    toast({
      title: "Toca cada chapa para confirmarla",
      description: "Recogida mientras espera, bajada en cuanto ya va a bordo",
      duration: 3500,
    });
  }, [passengerStopPills.length, toast]);

  const confirmPickupForPassenger = useCallback(
    (passengerId: string, name: string) => {
      // Igual que la bajada: se marca "pendiente" un momento corto (aquí no
      // hay espera real que simular, es solo un cortafuegos anti-doble-toque)
      // y se avisa con un toast — antes esto era totalmente silencioso, así
      // que no había manera de saber si el primer toque había funcionado.
      setPendingStopKeys((prev) => new Set(prev).add(passengerId));
      toast({ title: `Recogiendo a ${name}`, duration: 1200 });

      const tripId = trip.activeTripId;
      multiTrip.confirmPickup([passengerId]);
      if (tripId) {
        const tracked = multiTrip.passengers.find((p) => p.passenger.id === passengerId);
        if (tracked) {
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
      window.setTimeout(() => {
        setPendingStopKeys((prev) => {
          const next = new Set(prev);
          next.delete(passengerId);
          return next;
        });
      }, 700);
    },
    [multiTrip, trip.activeTripId, toast],
  );

  const handleStopButtonConfirm = useCallback(
    (stop: { passengerId: string; name: string; status: "waiting_pickup" | "in_car" }) => {
      if (stop.status === "waiting_pickup") {
        confirmPickupForPassenger(stop.passengerId, stop.name);
        return;
      }
      setPendingStopKeys((prev) => new Set(prev).add(stop.passengerId));
      toast({ title: `Bajando a ${stop.name}...`, description: "Esperando su confirmación", duration: 1800 });

      const tripId = trip.activeTripId;
      const tracked = multiTrip.passengers.find((p) => p.passenger.id === stop.passengerId);
      window.setTimeout(() => {
        multiTrip.confirmDropoff([stop.passengerId]);
        if (tripId && tracked) {
          supabase
            .from("trip_passengers")
            .update({ status: "dropped_off", dropped_off_at: new Date().toISOString() })
            .eq("trip_id", tripId)
            .eq("destination_lat", tracked.passenger.destination.lat)
            .eq("destination_lng", tracked.passenger.destination.lng)
            .neq("status", "dropped_off")
            .then(() => {}, () => {});
        }
        setPendingStopKeys((prev) => {
          const next = new Set(prev);
          next.delete(stop.passengerId);
          return next;
        });
        toast({ title: `${stop.name} confirmó la bajada`, duration: 1800 });
      }, 2200);
    },
    [confirmPickupForPassenger, multiTrip, trip.activeTripId, toast],
  );

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

  const expectedRouteTotalRef = useRef<number | null>(null);

  const handleMatchAcceptAndClose = useCallback(() => {
    setShowPreview(false);
    modals.closeMatchPopup();
    if (isDriverMode && simulatedPassenger) {
      expectedRouteTotalRef.current = simulatedPassenger.routeTotalDurationS;
      setAcceptedPassenger(simulatedPassenger);
      // Se añade a la cola real de pasajeros a bordo — puede haber ya otro
      // camino a su parada, o incluso ya recogido, sin que esto lo pise.
      multiTrip.acceptPassenger(simulatedPassenger);
      setIsMultiPassengerTripActive(true);
      setTripPassengerHistory((prev) =>
        prev.some((p) => p.id === simulatedPassenger.id) ? prev : [...prev, simulatedPassenger],
      );
    }
    trip.handleMatchAccept();
  }, [modals, trip, isDriverMode, simulatedPassenger, multiTrip]);

  // Compara la ruta real de navegación con la que se verificó al aceptar, más
  // lo que añade cada parada personal (medido aparte, con la misma ruta).
  useEffect(() => {
    const expected = expectedRouteTotalRef.current;
    const current = nav.currentRoute?.duration;
    if (expected == null || current == null) return;
    const detours = Object.values(errandDetours);
    if (detours.length < extraStops.length || detours.some((d) => d == null)) return;
    const errandSeconds = detours.reduce<number>((sum, d) => sum + (d ?? 0) * 60, 0);
    expectedRouteTotalRef.current = null;
    const diffMin = Math.round((current - (expected + errandSeconds)) / 60);
    if (Math.abs(diffMin) >= 2) {
      toast({
        title: "La ruta real ha cambiado",
        description: `${diffMin > 0 ? "+" : ""}${diffMin} min frente a lo verificado (tráfico o posición)`,
        duration: 3000,
      });
    }
  }, [nav.currentRoute, extraStops.length, errandDetours, toast]);

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
      // Antes se guardaban en el formulario y se tiraban aquí mismo — no
      // llegaban a filtrar con qué conductor se emparejaba.
      setPassengerPreferences({
        hasPet: settings.hasPet,
        needsChildSeat: settings.needsChildSeat,
        genderPreference: settings.genderPreference,
      });
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
      const driver = driverSim.searchDriver(undefined, { ...passengerPreferences, doorToDoor: isDoorToDoor });
      toast({
        title: "Conductor encontrado",
        description: `${driver.name} · ${driver.vehicle.brand} ${driver.vehicle.model} · ${driver.vehicle.licensePlate}`,
        duration: 1800,
      });
      modals.openMatchPopup();
    }, 6000);
    return () => clearTimeout(timer);
  }, [driverSearchEnabled, modals, driverSim, toast, passengerPreferences, isDoorToDoor]);

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

  // Parar desde el botón rojo cierra el viaje igual que el fin normal (con
  // valoración de los pasajeros) si lo había; luego corta la navegación.
  const handleStopNavigation = useCallback(() => {
    voice.cancelSpeech();
    if (trip.showActiveTrip || tripPassengerHistory.length > 0) {
      handleTripEndWithSummary();
    }
    nav.handleStopNavigation();
    dismissSimPassenger();
    setAcceptedPassenger(null);
    setExtraStops([]);
    (window as any).__mapCenterOnUser?.();
  }, [voice, nav, trip.showActiveTrip, tripPassengerHistory.length, handleTripEndWithSummary, dismissSimPassenger]);

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
        purpleUntilStop={extraStops[0] ?? null}
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
          onOpenSearch={handleOpenDestinationSearch}
          destination={nav.destination}
          isNavigating={nav.isNavigating}
          travelMode={nav.travelMode}
          isRouteLoading={nav.isRouteLoading}
          hasKnownLocation={!!realUserLocation}
          isMuted={voice.isMuted}
          onToggleMuted={voice.toggleMuted}
          onStopNavigation={handleStopNavigation}
        />

        {/* Paradas personales activas — chip por cada una con su cruz para
            quitarla; no hace falta abrir ningún menú para gestionarlas. */}
        {extraStops.length > 0 && (
          // top-40, no top-16: a esa altura ya está el aviso de navegación
          // (NavigationOverlays), que ahora es más alto por el icono grande.
          <div className="absolute top-40 left-3 right-3 z-10 flex flex-wrap gap-1.5 pointer-events-none">
            {extraStops.map((stop) => (
              <button
                key={stop.id}
                onClick={() => handleRemoveExtraStop(stop.id)}
                className="pointer-events-auto flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-medium text-white shadow-lg"
                style={{ background: "hsl(190, 80%, 42%)" }}
                aria-label={`Quitar parada: ${stop.name}`}
              >
                <span className="truncate max-w-[120px]">{stop.name}</span>
                {errandDetours[`errand-${stop.id}`] != null && (
                  <span className="text-[10px] opacity-80 shrink-0">+{errandDetours[`errand-${stop.id}`]} min</span>
                )}
                <X className="w-3 h-3 shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Añadir parada — lupa en la esquina inferior izquierda, a la
            misma altura que las chapas de pasajero del lateral derecho.
            Antes era un "+" en la barra de arriba, lejos de donde está
            toda la demás acción del viaje. */}
        {nav.isNavigating && (
          <div className="fixed left-3 z-30 pointer-events-none" style={{ bottom: overlayBottom(OVERLAY_BOTTOM_PX.addStopButton) }}>
            <Button
              variant="glass"
              size="icon"
              className="pointer-events-auto rounded-full shadow-lg"
              onClick={handleOpenAddStopSearch}
              aria-label="Añadir parada"
            >
              <Search className="w-5 h-5 text-primary" />
            </Button>
          </div>
        )}

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
          detourMinutes={passengerDetourTotal > 0 ? passengerDetourTotal : null}
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
          isDriverMode={isDriverMode}
          onDriverToggle={handleDriverToggle}
          onOpenDriverSettings={modals.openDriverSettings}
          isPassengerMode={isPassengerMode}
          onPassengerToggle={handlePassengerToggle}
          onOpenPassengerSettings={modals.openPassengerSettings}
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
          hasMoreStops={multiStops.length > 0}
        />
      </AnimatePresence>

      {trip.showActiveTrip && trip.activeTripRole === "driver" && (
        <StopConfirmButtons
          stops={passengerStopPills}
          pendingKeys={pendingStopKeys}
          onConfirm={handleStopButtonConfirm}
        />
      )}

      {/* Total compensado por ahora en este viaje — centrado abajo, junto a
          la tarjeta de cancelar/destino (la esquina inferior derecha ahora
          es de los botones fijos de zoom/centrar). Antes, cuando llegaba
          una solicitud nueva, salía una barra en mitad de la pantalla con
          el viaje en curso; ahora esa barra desaparece del todo y este
          total persistente la sustituye. */}
      {trip.showActiveTrip && trip.activeTripRole === "driver" && totalTripCompensation > 0 && (
        <div className="fixed left-1/2 -translate-x-1/2 z-30 pointer-events-none" style={{ bottom: overlayBottom(OVERLAY_BOTTOM_PX.compensatedBadge) }}>
          <div className="glass-strong rounded-full px-3 py-1.5 flex items-center gap-1.5 border border-success/30">
            <span className="text-[9px] text-muted-foreground">Compensado</span>
            <span className="text-sm font-bold text-success">+{totalTripCompensation.toFixed(2)}€</span>
          </div>
        </div>
      )}

      {/* Modals */}
      <NavigationSearch
        isOpen={modals.showNavigationSearch}
        onClose={modals.closeNavigationSearch}
        onNavigate={nav.handleNavigate}
        userLocation={realUserLocation}
        travelMode={nav.travelMode}
        onTravelModeChange={nav.setTravelMode}
        mode={searchMode}
        onAddStop={handleAddStop}
      />


      <PassengerSettingsSheet
        isOpen={modals.showPassengerSettings}
        onClose={modals.closePassengerSettings}
        userLocation={realUserLocation}
        onSave={handlePassengerSettingsSave}
        initialPreferences={{
          hasPet: passengerPreferences.hasPet,
          needsChildSeat: passengerPreferences.needsChildSeat,
          doorToDoor: isDoorToDoor,
          genderPreference: passengerPreferences.genderPreference,
        }}
      />

      <DriverSettingsSheet
        isOpen={modals.showDriverSettings}
        onClose={modals.closeDriverSettings}
        initialSettings={driverSettings}
        costPerKm={liveCostPerKm ?? vehicles.activeVehicle?.costPerKm}
        fuelPriceInfo={(() => {
          const vehicle = vehicles.activeVehicle;
          if (!vehicle || !fuelPricesAlongRoute) return null;
          const pricePerLiter =
            vehicle.fuelType === "diesel" ? fuelPricesAlongRoute.dieselA
            : vehicle.fuelType === "gasoline" || vehicle.fuelType === "hybrid" ? fuelPricesAlongRoute.gasoline95
            : null;
          if (pricePerLiter == null) return null;
          return { pricePerLiter, stationCount: fuelPricesAlongRoute.stationCount };
        })()}
        onSave={(settings) => {
          setDriverSettings({
            seats: settings.seats,
            maxDetour: settings.maxDetour,
            acceptsPets: settings.acceptsPets,
            hasChildSeat: settings.hasChildSeat,
            doorToDoor: settings.doorToDoor,
            genderPreference: settings.genderPreference,
          });
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
        onSubmit={(results) => {
          const targets = lastTripSummary?.targets ?? [];
          // El 10% solo se gana valorando a TODAS las personas del viaje,
          // no con dejar a una sin valorar.
          const allRated = targets.length > 0 && targets.every((t) => results.some((r) => r.id === t.id));
          toast({
            title: "¡Gracias por tu valoración!",
            description: allRated
              ? "Has valorado a todos — 10% de descuento en tu próximo viaje"
              : "Valora a todos la próxima vez para conseguir el 10% de descuento",
            duration: 2200,
          });
        }}
        targets={lastTripSummary?.targets ?? []}
        tripInfo={lastTripSummary?.tripInfo ?? ""}
        totalSaved={lastTripSummary?.totalSaved}
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
