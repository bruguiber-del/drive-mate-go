import { useState, useEffect, useCallback, useRef } from 'react';
import { calculatePrice } from '@/lib/priceCalculator';

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
  acceptsPets: boolean;
  hasChildSeat: boolean;
  doorToDoor: boolean;
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
  // baseLat/baseLng: el punto exacto sobre la ruta, antes del desplazamiento
  // — necesario para medir cuánto se desvía de verdad de la ruta real.
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

// Velocidad media estimada para traducir el desvío en km a minutos —
// sustituye al valor puramente aleatorio que había antes y que no tenía
// relación ninguna con el ajuste real de "desvío máximo" del conductor.
const AVG_DETOUR_SPEED_KMH = 28;

function generatePassenger(
  userLat: number,
  userLng: number,
  driverRoute: [number, number][],
  driverDestination: { lat: number; lng: number; name: string } | null,
  costPerKm?: number,
  maxDetourMinutes?: number,
  driverPrefs?: DriverMatchPreferences,
): SimulatedPassenger | null {

  // Index of the driver's current position along the route
  let driverIdx = 0;
  let minD = Infinity;
  for (let i = 0; i < driverRoute.length; i++) {
    const d = haversineKm(userLat, userLng, driverRoute[i][0], driverRoute[i][1]);
    if (d < minD) { minD = d; driverIdx = i; }
  }
  // Pickup must come from a point AHEAD of the driver on the route
  if (driverIdx >= driverRoute.length - 2) return null;
  const pickupIdx =
    driverIdx + 1 + Math.floor(Math.random() * Math.max(1, Math.floor((driverRoute.length - driverIdx) * 0.5)));
  const basePickup = driverRoute[Math.min(pickupIdx, driverRoute.length - 2)];
  // Small offset so it sits on a nearby street, not exactly on the polyline
  const pickupLat = basePickup[0] + (Math.random() - 0.5) * 0.006;
  const pickupLng = basePickup[1] + (Math.random() - 0.5) * 0.008;

  // Pickup must be ahead of the driver along their route
  if (!isPickupAheadOnRoute(userLat, userLng, pickupLat, pickupLng, driverRoute)) {
    return null;
  }

  // Distancia desde donde está el conductor ahora mismo hasta la recogida —
  // solo para descartar candidatos absurdamente lejos y para el texto "a
  // X m/km" que se le muestra. NO es el desvío real: esa distancia la
  // conduce el conductor de todas formas, vaya o no a por el pasajero.
  const distanceToDriverKm = haversineKm(userLat, userLng, pickupLat, pickupLng);
  const maxPickupDistanceKm = 8;
  if (distanceToDriverKm > maxPickupDistanceKm) return null;

  // Passenger destination must lie further along the driver's route
  const destSlice = driverRoute.slice(Math.min(pickupIdx + 1, driverRoute.length - 1));
  const destPoint = findPointNearRoute(destSlice);
  if (!destPoint) return null;

  // El género de la solicitud respeta la preferencia real del conductor —
  // antes el ajuste se guardaba pero nunca filtraba nada.
  const gender: 'women' | 'men' =
    driverPrefs?.genderPreference === 'women' ? 'women'
    : driverPrefs?.genderPreference === 'men' ? 'men'
    : Math.random() > 0.5 ? 'women' : 'men';
  const names = gender === 'women' ? PASSENGER_NAMES_WOMEN : PASSENGER_NAMES_MEN;
  const name = names[Math.floor(Math.random() * names.length)];

  const distM = distanceToDriverKm * 1000;
  const tripDistanceKm = haversineKm(pickupLat, pickupLng, destPoint.lat, destPoint.lng);
  // Minimum trip length so prices aren't nonsense
  if (tripDistanceKm < 2) return null;

  // Desvío REAL fuera de la ruta: cuánto se aparta la recogida/bajada del
  // punto exacto de la ruta, no toda la distancia hasta llegar ahí (esa la
  // conduce el conductor igualmente hacia su propio destino).
  const pickupDeviationKm = haversineKm(basePickup[0], basePickup[1], pickupLat, pickupLng);
  const dropoffDeviationKm = haversineKm(destPoint.baseLat, destPoint.baseLng, destPoint.lat, destPoint.lng);
  const routeDeviationKm = pickupDeviationKm + dropoffDeviationKm;
  // ~150m: por debajo de eso se considera que la recogida/bajada coincide
  // con la ruta y no hay desvío real que cobrar ni contar como tiempo extra.
  const ON_ROUTE_THRESHOLD_KM = 0.15;
  const detourKm = routeDeviationKm > ON_ROUTE_THRESHOLD_KM ? routeDeviationKm * 2 : 0; // ida y vuelta a la ruta
  const detourMinutes = Math.ceil((detourKm / AVG_DETOUR_SPEED_KMH) * 60);

  // Límite duro: si el conductor puso "máx. 5 min", nunca se propone algo
  // que le desvíe más de 6 — antes esto ni se comprobaba, porque el
  // desvío mostrado era un número aleatorio sin relación con la geometría.
  if (maxDetourMinutes != null && detourMinutes > maxDetourMinutes + 1) return null;

  // Nunca se propone una solicitud que el conductor no podría aceptar — antes
  // mascota/silla/puerta a puerta salían al azar sin mirar lo que el
  // conductor había marcado en sus ajustes.
  const acceptsPets = driverPrefs?.acceptsPets ? Math.random() > 0.6 : false;
  const hasChildSeat = driverPrefs?.hasChildSeat ? Math.random() > 0.8 : false;
  const doorToDoor = driverPrefs?.doorToDoor ? Math.random() > 0.5 : false;

  // El pasajero paga los km que pasa de verdad en el coche (recogida →
  // destino) — a menos que la recogida o la bajada no coincidan con la ruta
  // del conductor, en cuyo caso también paga ese desvío real.
  const billableKm = tripDistanceKm + detourKm;
  const pricing = calculatePrice({
    distanceKm: billableKm,
    passengerCount: 1,
    traffic: 'normal',
    costPerKm,
    hasPet: acceptsPets,
    hasChildSeat,
    isDoorToDoor: doorToDoor,
  });


  return {
    id: crypto.randomUUID(),
    name,
    gender,
    rating: parseFloat((randomInRange(4.2, 5.0)).toFixed(1)),
    origin: {
      lat: pickupLat,
      lng: pickupLng,
      name: `Calle ${Math.floor(randomInRange(1, 50))}`,
    },
    destination: {
      lat: destPoint.lat,
      lng: destPoint.lng,
      // Antes se etiquetaba con el pueblo de Aragón más cercano de una
      // lista fija — con GPS real en cualquier otro sitio (p. ej. Ibiza)
      // salía un nombre de una ciudad a cientos de km, sin relación con el
      // mapa. Una calle genérica no miente sobre dónde está.
      name: `Avenida ${Math.floor(randomInRange(1, 50))}`,
    },
    detourMinutes,
    pickupDistance: distM < 1000 ? `${Math.round(distM)}m` : `${(distM / 1000).toFixed(1)}km`,
    compensation: pricing.driverIncome,
    acceptsPets,
    hasChildSeat,
    doorToDoor,
  };
}

interface UsePassengerSimulationOptions {
  enabled: boolean;
  userLocation: [number, number] | null;
  intervalMs?: number;
  driverRoute?: [number, number][] | null;
  driverDestination?: { lat: number; lng: number; name: string } | null;
  /** Cost per km of the driver's active vehicle */
  costPerKm?: number;
  /** Desvío máximo (min) fijado en los ajustes del conductor — se rechaza
   *  cualquier candidato que se pase de ese límite en más de 1 minuto. */
  maxDetourMinutes?: number;
  /** Mascotas / silla infantil / puerta a puerta / preferencia de género que
   *  el conductor marcó en sus ajustes — filtran de verdad las solicitudes. */
  driverPreferences?: DriverMatchPreferences;
}

export function usePassengerSimulation({
  enabled,
  userLocation,
  intervalMs = 8000,
  driverRoute,
  driverDestination,
  costPerKm,
  maxDetourMinutes,
  driverPreferences,
}: UsePassengerSimulationOptions) {
  const [currentPassenger, setCurrentPassenger] = useState<SimulatedPassenger | null>(null);
  const [pendingPassengers, setPendingPassengers] = useState<SimulatedPassenger[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest route/destination available to the interval callback without
  // resetting the timer every time the route updates slightly.
  const routeRef = useRef<[number, number][] | null>(driverRoute ?? null);
  const destRef = useRef<typeof driverDestination>(driverDestination ?? null);
  const costRef = useRef<number | undefined>(costPerKm);
  const maxDetourRef = useRef<number | undefined>(maxDetourMinutes);
  const prefsRef = useRef<DriverMatchPreferences | undefined>(driverPreferences);
  useEffect(() => { routeRef.current = driverRoute ?? null; }, [driverRoute]);
  useEffect(() => { destRef.current = driverDestination ?? null; }, [driverDestination]);
  useEffect(() => { costRef.current = costPerKm; }, [costPerKm]);
  useEffect(() => { maxDetourRef.current = maxDetourMinutes; }, [maxDetourMinutes]);
  useEffect(() => { prefsRef.current = driverPreferences; }, [driverPreferences]);

  const generateNew = useCallback(() => {
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
    const passenger = generatePassenger(
      lat, lng, route, destRef.current ?? null, costRef.current, maxDetourRef.current, prefsRef.current,
    );

    if (!passenger) return;
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
