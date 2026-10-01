import { useState, useEffect, useCallback, useRef } from 'react';
import { calculatePrice } from '@/lib/priceCalculator';
import { MAPBOX_TOKEN } from '@/lib/mapboxConfig';
import { clusterPlannedStops, findOptimalStopOrder } from '@/lib/multiStopPlanning';

export interface SimulatedPassenger {
  id: string;
  name: string;
  gender: 'women' | 'men';
  rating: number;
  origin: { lat: number; lng: number; name: string };
  destination: { lat: number; lng: number; name: string };
  detourMinutes: number;
  pickupDistance: string;
  compensation: number;
  /** Km del trayecto en sí (recogida → destino), sin contar el desvío. */
  tripDistanceKm: number;
  /** Km de desvío real fuera de la ruta del conductor (ida y vuelta). */
  detourKm: number;
  acceptsPets: boolean;
  hasChildSeat: boolean;
  doorToDoor: boolean;
}

/** Pasajero ya aceptado/a bordo — la forma mínima que hace falta para medir
 *  el desvío real combinado con un candidato nuevo. */
export interface ActiveTrackedPassenger {
  id: string;
  name: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  status: 'waiting_pickup' | 'in_car';
}

const PASSENGER_NAMES_WOMEN = ['María G.', 'Ana P.', 'Laura M.', 'Lucía T.', 'Marta V.'];
const PASSENGER_NAMES_MEN = ['Pablo R.', 'Carlos S.', 'Jorge F.', 'Iván S.', 'Andrés M.'];

/** Preferencias reales del conductor — antes se guardaban en el ajuste pero
 *  nunca llegaban a filtrar nada del emparejamiento. */
export interface DriverMatchPreferences {
  acceptsPets: boolean;
  hasChildSeat: boolean;
  doorToDoor: boolean;
  genderPreference: 'none' | 'women' | 'men';
}

const FALLBACK_LAT = 42.1401;
const FALLBACK_LNG = -0.4087;

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Pick a point that lies near the driver's route (between 20%-80% along it),
 * with a small offset so it's not exactly on the road.
 * routeCoords are [lat, lng] tuples (same convention as RouteData).
 */
function findPointNearRoute(
  routeCoords: [number, number][],
): { lat: number; lng: number; baseLat: number; baseLng: number } | null {
  if (!routeCoords || routeCoords.length < 2) return null;
  const startIdx = Math.floor(routeCoords.length * 0.2);
  const endIdx = Math.max(startIdx + 1, Math.floor(routeCoords.length * 0.8));
  const randomIdx = startIdx + Math.floor(Math.random() * (endIdx - startIdx));
  const [lat, lng] = routeCoords[randomIdx];
  const offsetLat = (Math.random() - 0.5) * 0.01;
  const offsetLng = (Math.random() - 0.5) * 0.01;
  return { lat: lat + offsetLat, lng: lng + offsetLng, baseLat: lat, baseLng: lng };
}

/**
 * Checks that the pickup point lies AHEAD of the driver along their route
 * (higher index in the route coordinate array).
 */
function isPickupAheadOnRoute(
  driverLat: number, driverLng: number,
  pickupLat: number, pickupLng: number,
  routeCoords: [number, number][],
): boolean {
  if (routeCoords.length < 2) return true;

  let driverRouteIdx = 0;
  let minDistDriver = Infinity;
  for (let i = 0; i < routeCoords.length; i++) {
    const d = Math.sqrt(
      Math.pow(routeCoords[i][0] - driverLat, 2) +
      Math.pow(routeCoords[i][1] - driverLng, 2)
    );
    if (d < minDistDriver) { minDistDriver = d; driverRouteIdx = i; }
  }

  let pickupRouteIdx = 0;
  let minDistPickup = Infinity;
  for (let i = 0; i < routeCoords.length; i++) {
    const d = Math.sqrt(
      Math.pow(routeCoords[i][0] - pickupLat, 2) +
      Math.pow(routeCoords[i][1] - pickupLng, 2)
    );
    if (d < minDistPickup) { minDistPickup = d; pickupRouteIdx = i; }
  }

  return pickupRouteIdx > driverRouteIdx;
}

interface CandidateDraft {
  pickupLat: number;
  pickupLng: number;
  destLat: number;
  destLng: number;
  name: string;
  gender: 'women' | 'men';
  rating: number;
  pickupDistanceLabel: string;
  tripDistanceKm: number;
  acceptsPets: boolean;
  hasChildSeat: boolean;
  doorToDoor: boolean;
}

/** Fase 1 — geometría y elegibilidad básicas, todo síncrono: dónde iría
 *  recogida/bajada, si está dentro del radio razonable, nombre sin
 *  repetir... Nada de desvío todavía: eso se mide de verdad en la fase 2
 *  con una llamada real a Mapbox, no se estima aquí. */
function buildCandidateDraft(
  userLat: number,
  userLng: number,
  driverRoute: [number, number][],
  driverPrefs?: DriverMatchPreferences,
  excludeNames?: Set<string>,
): CandidateDraft | null {
  let driverIdx = 0;
  let minD = Infinity;
  for (let i = 0; i < driverRoute.length; i++) {
    const d = haversineKm(userLat, userLng, driverRoute[i][0], driverRoute[i][1]);
    if (d < minD) { minD = d; driverIdx = i; }
  }
  if (driverIdx >= driverRoute.length - 2) return null;
  const pickupIdx =
    driverIdx + 1 + Math.floor(Math.random() * Math.max(1, Math.floor((driverRoute.length - driverIdx) * 0.5)));
  const basePickup = driverRoute[Math.min(pickupIdx, driverRoute.length - 2)];
  const pickupLat = basePickup[0] + (Math.random() - 0.5) * 0.006;
  const pickupLng = basePickup[1] + (Math.random() - 0.5) * 0.008;

  if (!isPickupAheadOnRoute(userLat, userLng, pickupLat, pickupLng, driverRoute)) {
    return null;
  }

  // Solo para descartar candidatos absurdamente lejos y el texto "a X m/km"
  // — NO es el desvío real: esa distancia la conduce el conductor de todas
  // formas, vaya o no a por el pasajero.
  const distanceToDriverKm = haversineKm(userLat, userLng, pickupLat, pickupLng);
  const maxPickupDistanceKm = 8;
  if (distanceToDriverKm > maxPickupDistanceKm) return null;

  const destSlice = driverRoute.slice(Math.min(pickupIdx + 1, driverRoute.length - 1));
  const destPoint = findPointNearRoute(destSlice);
  if (!destPoint) return null;

  const gender: 'women' | 'men' =
    driverPrefs?.genderPreference === 'women' ? 'women'
    : driverPrefs?.genderPreference === 'men' ? 'men'
    : Math.random() > 0.5 ? 'women' : 'men';
  const namesPool = gender === 'women' ? PASSENGER_NAMES_WOMEN : PASSENGER_NAMES_MEN;
  const availableNames = excludeNames ? namesPool.filter((n) => !excludeNames.has(n)) : namesPool;
  const names = availableNames.length > 0 ? availableNames : namesPool;
  const name = names[Math.floor(Math.random() * names.length)];

  const distM = distanceToDriverKm * 1000;
  const tripDistanceKm = haversineKm(pickupLat, pickupLng, destPoint.lat, destPoint.lng);
  if (tripDistanceKm < 2) return null;

  const acceptsPets = driverPrefs?.acceptsPets ? Math.random() > 0.6 : false;
  const hasChildSeat = driverPrefs?.hasChildSeat ? Math.random() > 0.8 : false;
  const doorToDoor = driverPrefs?.doorToDoor ? Math.random() > 0.5 : false;

  return {
    pickupLat,
    pickupLng,
    destLat: destPoint.lat,
    destLng: destPoint.lng,
    name,
    gender,
    rating: parseFloat(randomInRange(4.2, 5.0).toFixed(1)),
    pickupDistanceLabel: distM < 1000 ? `${Math.round(distM)}m` : `${(distM / 1000).toFixed(1)}km`,
    tripDistanceKm,
    acceptsPets,
    hasChildSeat,
    doorToDoor,
  };
}

const MAPBOX_DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic';

/** Llama a Mapbox Directions de verdad para una secuencia de puntos — sin
 *  geometría ni pasos, solo la duración y distancia totales, que es lo
 *  único que hace falta para medir el desvío real (no estimado). */
async function fetchRealRoute(
  points: { lat: number; lng: number }[],
): Promise<{ durationS: number; distanceM: number } | null> {
  if (points.length < 2) return null;
  try {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `${MAPBOX_DIRECTIONS_BASE}/${coords}?overview=false&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;
    return { durationS: route.duration, distanceM: route.distance };
  } catch {
    return null;
  }
}

/** Fase 2 — desvío 100% real: construye la ruta de verdad (paradas ya
 *  aceptadas + esta candidata, en el orden óptimo que respeta recoger antes
 *  de bajar) y la manda a Mapbox. Compara esa duración real contra la ruta
 *  real actual para sacar lo que aporta SOLO esta candidata — el desvío es
 *  POR PASAJERO, no la suma acumulada del viaje entero, así que el límite
 *  de los ajustes se compara contra esa cifra individual. Si Mapbox no
 *  responde, no se ofrece el candidato — mejor no proponerlo que
 *  proponerlo con un desvío inventado. */
async function verifyRealDetour(
  driverLat: number,
  driverLng: number,
  draft: CandidateDraft,
  candidateId: string,
  existingPassengers: ActiveTrackedPassenger[],
  finalDestination: { lat: number; lng: number } | null,
  existingRouteDurationS: number,
  existingRouteDistanceM: number,
  maxDetourMinutes?: number,
): Promise<{ detourMinutes: number; detourKm: number } | null> {
  const rawStops: Array<{ kind: 'pickup' | 'dropoff'; lat: number; lng: number; passengerId: string; passengerName: string }> = [];
  for (const p of existingPassengers) {
    if (p.status === 'waiting_pickup') {
      rawStops.push({ kind: 'pickup', lat: p.origin.lat, lng: p.origin.lng, passengerId: p.id, passengerName: p.name });
    }
    rawStops.push({ kind: 'dropoff', lat: p.destination.lat, lng: p.destination.lng, passengerId: p.id, passengerName: p.name });
  }
  rawStops.push({ kind: 'pickup', lat: draft.pickupLat, lng: draft.pickupLng, passengerId: candidateId, passengerName: draft.name });
  rawStops.push({ kind: 'dropoff', lat: draft.destLat, lng: draft.destLng, passengerId: candidateId, passengerName: draft.name });

  const clustered = clusterPlannedStops(rawStops);
  const alreadyPickedUp = new Set(existingPassengers.filter((p) => p.status === 'in_car').map((p) => p.id));
  const ordered = findOptimalStopOrder({ lat: driverLat, lng: driverLng }, clustered, alreadyPickedUp);

  const points = [{ lat: driverLat, lng: driverLng }, ...ordered.map((s) => ({ lat: s.lat, lng: s.lng }))];
  if (finalDestination) points.push(finalDestination);

  const real = await fetchRealRoute(points);
  if (!real) return null;

  // Lo que aporta SOLO esta candidata — la ruta completa con ella puesta,
  // menos la ruta real actual sin ella. Es la cifra que se compara contra
  // el máximo de los ajustes (por pasajero) Y la que se usa para su precio.
  const detourMinutes = Math.max(0, Math.ceil((real.durationS - existingRouteDurationS) / 60));
  const detourKm = Math.max(0, (real.distanceM - existingRouteDistanceM) / 1000);

  if (maxDetourMinutes != null && detourMinutes > maxDetourMinutes) return null;

  return { detourMinutes, detourKm };
}

interface UsePassengerSimulationOptions {
  enabled: boolean;
  userLocation: [number, number] | null;
  intervalMs?: number;
  driverRoute?: [number, number][] | null;
  driverDestination?: { lat: number; lng: number; name: string } | null;
  /** Cost per km of the driver's active vehicle */
  costPerKm?: number;
  /** Desvío máximo (min) fijado en los ajustes del conductor — tope POR
   *  PASAJERO: lo que aporta cada candidato individualmente, no la suma de
   *  todos los que ya llevas. 0 = solo se ofrecen candidatos que caben
   *  prácticamente en tu ruta tal cual, sin desviarte nada. */
  maxDetourMinutes?: number;
  /** Mascotas / silla infantil / puerta a puerta / preferencia de género que
   *  el conductor marcó en sus ajustes — filtran de verdad las solicitudes. */
  driverPreferences?: DriverMatchPreferences;
  /** Nombres de pasajeros que el conductor ya lleva a bordo o tiene
   *  pendientes de recoger — para no proponer una solicitud nueva con el
   *  mismo nombre y que parezca la misma persona duplicada. */
  activePassengerNames?: Set<string>;
  /** Pasajeros ya aceptados/a bordo — hace falta su posición real para
   *  construir la ruta combinada que se manda a Mapbox. */
  activeTrackedPassengers?: ActiveTrackedPassenger[];
  /** Duración (s) y distancia (m) de la ruta real ACTUAL (con las paradas
   *  ya aceptadas, si hay alguna) — línea base para medir cuánto añade
   *  SOLO la candidata nueva. */
  existingRouteDurationS?: number | null;
  existingRouteDistanceM?: number | null;
  /** Duración (s) de la ruta original, de cero pasajeros — línea base para
   *  el límite TOTAL acumulado de los ajustes. */
  originalDurationS?: number | null;
}

export function usePassengerSimulation({
  enabled,
  userLocation,
  // +10s sobre lo que había — llegaban solicitudes demasiado seguidas para
  // sentirse "normal".
  intervalMs = 18000,
  driverRoute,
  driverDestination,
  costPerKm,
  maxDetourMinutes,
  driverPreferences,
  activePassengerNames,
  activeTrackedPassengers,
  existingRouteDurationS,
  existingRouteDistanceM,
  originalDurationS,
}: UsePassengerSimulationOptions) {
  const [currentPassenger, setCurrentPassenger] = useState<SimulatedPassenger | null>(null);
  const [pendingPassengers, setPendingPassengers] = useState<SimulatedPassenger[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Evita solapar dos verificaciones a la vez si una tarda más que el
  // intervalo entre intentos (la llamada a Mapbox es async).
  const isGeneratingRef = useRef(false);

  // Keep latest route/destination available to the interval callback without
  // resetting the timer every time the route updates slightly.
  const routeRef = useRef<[number, number][] | null>(driverRoute ?? null);
  const destRef = useRef<typeof driverDestination>(driverDestination ?? null);
  const costRef = useRef<number | undefined>(costPerKm);
  const maxDetourRef = useRef<number | undefined>(maxDetourMinutes);
  const prefsRef = useRef<DriverMatchPreferences | undefined>(driverPreferences);
  const activeNamesRef = useRef<Set<string> | undefined>(activePassengerNames);
  const trackedRef = useRef<ActiveTrackedPassenger[]>(activeTrackedPassengers ?? []);
  const existingDurationRef = useRef<number | null | undefined>(existingRouteDurationS);
  const existingDistanceRef = useRef<number | null | undefined>(existingRouteDistanceM);
  const originalDurationRef = useRef<number | null | undefined>(originalDurationS);
  useEffect(() => { routeRef.current = driverRoute ?? null; }, [driverRoute]);
  useEffect(() => { destRef.current = driverDestination ?? null; }, [driverDestination]);
  useEffect(() => { costRef.current = costPerKm; }, [costPerKm]);
  useEffect(() => { maxDetourRef.current = maxDetourMinutes; }, [maxDetourMinutes]);
  useEffect(() => { prefsRef.current = driverPreferences; }, [driverPreferences]);
  useEffect(() => { activeNamesRef.current = activePassengerNames; }, [activePassengerNames]);
  useEffect(() => { trackedRef.current = activeTrackedPassengers ?? []; }, [activeTrackedPassengers]);
  useEffect(() => { existingDurationRef.current = existingRouteDurationS; }, [existingRouteDurationS]);
  useEffect(() => { existingDistanceRef.current = existingRouteDistanceM; }, [existingRouteDistanceM]);
  useEffect(() => { originalDurationRef.current = originalDurationS; }, [originalDurationS]);

  const generateNew = useCallback(async () => {
    if (isGeneratingRef.current) return;
    if (!userLocation) return;
    const [lat, lng] = userLocation;
    if (
      Math.abs(lat - FALLBACK_LAT) < 1e-4 &&
      Math.abs(lng - FALLBACK_LNG) < 1e-4
    ) {
      return;
    }
    const route = routeRef.current;
    if (!route || route.length < 2) return;

    const draft = buildCandidateDraft(lat, lng, route, prefsRef.current, activeNamesRef.current);
    if (!draft) return;

    // Sin una línea base real de duración no hay forma de verificar nada
    // de verdad — mejor no ofrecer el candidato que inventarse un desvío.
    const existingDuration = existingDurationRef.current ?? originalDurationRef.current;
    const existingDistance = existingDistanceRef.current ?? 0;
    if (existingDuration == null) return;

    isGeneratingRef.current = true;
    const candidateId = crypto.randomUUID();
    const verified = await verifyRealDetour(
      lat, lng, draft, candidateId,
      trackedRef.current,
      destRef.current ?? null,
      existingDuration,
      existingDistance,
      maxDetourRef.current,
    );
    isGeneratingRef.current = false;
    if (!verified) return;

    const pricing = calculatePrice({
      distanceKm: draft.tripDistanceKm,
      detourKm: verified.detourKm,
      passengerCount: 1,
      traffic: 'normal',
      costPerKm: costRef.current,
      hasPet: draft.acceptsPets,
      hasChildSeat: draft.hasChildSeat,
    });

    const passenger: SimulatedPassenger = {
      id: candidateId,
      name: draft.name,
      gender: draft.gender,
      rating: draft.rating,
      origin: {
        lat: draft.pickupLat,
        lng: draft.pickupLng,
        name: `Calle ${Math.floor(randomInRange(1, 50))}`,
      },
      destination: {
        lat: draft.destLat,
        lng: draft.destLng,
        name: `Avenida ${Math.floor(randomInRange(1, 50))}`,
      },
      detourMinutes: verified.detourMinutes,
      pickupDistance: draft.pickupDistanceLabel,
      compensation: pricing.driverIncome,
      tripDistanceKm: draft.tripDistanceKm,
      detourKm: verified.detourKm,
      acceptsPets: draft.acceptsPets,
      hasChildSeat: draft.hasChildSeat,
      doorToDoor: draft.doorToDoor,
    };

    setPendingPassengers(prev => [...prev.slice(-4), passenger]);
    setCurrentPassenger(passenger);
  }, [userLocation]);

  const dismissCurrent = useCallback(() => {
    setCurrentPassenger(null);
  }, []);

  const acceptCurrent = useCallback(() => {
    const accepted = currentPassenger;
    setCurrentPassenger(null);
    return accepted;
  }, [currentPassenger]);

  // Only generate passengers when enabled, GPS is known AND the driver has a route
  const hasRoute = !!(driverRoute && driverRoute.length >= 2);
  useEffect(() => {
    if (!enabled || !userLocation || !hasRoute) {
      // Stop generating new passengers, but KEEP the current one so the driver
      // can still accept it from the open MatchPopup. It is only cleared via
      // dismissCurrent / acceptCurrent.
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }


    timerRef.current = setTimeout(() => {
      generateNew();
      const interval = setInterval(generateNew, intervalMs);
      timerRef.current = interval as any;
    }, 3000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        clearInterval(timerRef.current as any);
      }
    };
  }, [enabled, userLocation, intervalMs, generateNew, hasRoute]);

  return {
    currentPassenger,
    pendingPassengers,
    generateNew,
    dismissCurrent,
    acceptCurrent,
  };
}
