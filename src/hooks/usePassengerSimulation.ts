import { useState, useEffect, useCallback, useRef } from 'react';
import { calculatePrice } from '@/lib/priceCalculator';

export interface SimulatedPassenger {
  id: string;
  name: string;
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

const PASSENGER_NAMES = ['María G.', 'Ana P.', 'Laura M.', 'Pablo R.', 'Carlos S.', 'Lucía T.', 'Marta V.', 'Jorge F.'];

// Reference cities (Aragón + nearby) used to name nearest place for a point.
const KNOWN_CITIES = [
  { name: 'Huesca', lat: 42.1401, lng: -0.4087 },
  { name: 'Zaragoza', lat: 41.6488, lng: -0.8891 },
  { name: 'Jaca', lat: 42.5697, lng: -0.5496 },
  { name: 'Barbastro', lat: 42.0353, lng: 0.1267 },
  { name: 'Monzón', lat: 41.9108, lng: 0.1933 },
  { name: 'Sabiñánigo', lat: 42.5186, lng: -0.3647 },
  { name: 'Teruel', lat: 40.3456, lng: -1.1065 },
  { name: 'Calatayud', lat: 41.3564, lng: -1.6432 },
  { name: 'Fraga', lat: 41.5197, lng: 0.3467 },
  { name: 'Lleida', lat: 41.6176, lng: 0.62 },
  { name: 'Ayerbe', lat: 42.2789, lng: -0.6886 },
  { name: 'Almudévar', lat: 42.0410, lng: -0.5800 },
  { name: 'Tardienta', lat: 41.9586, lng: -0.5328 },
];

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

function nearestCityName(lat: number, lng: number): string {
  let best = KNOWN_CITIES[0];
  let bestD = Infinity;
  for (const c of KNOWN_CITIES) {
    const d = haversineKm(lat, lng, c.lat, c.lng);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best.name;
}

/**
 * Pick a point that lies near the driver's route (between 20%-80% along it),
 * with a small offset so it's not exactly on the road.
 * routeCoords are [lat, lng] tuples (same convention as RouteData).
 */
function findPointNearRoute(
  routeCoords: [number, number][],
): { lat: number; lng: number } | null {
  if (!routeCoords || routeCoords.length < 2) return null;
  const startIdx = Math.floor(routeCoords.length * 0.2);
  const endIdx = Math.max(startIdx + 1, Math.floor(routeCoords.length * 0.8));
  const randomIdx = startIdx + Math.floor(Math.random() * (endIdx - startIdx));
  const [lat, lng] = routeCoords[randomIdx];
  const offsetLat = (Math.random() - 0.5) * 0.01;
  const offsetLng = (Math.random() - 0.5) * 0.01;
  return { lat: lat + offsetLat, lng: lng + offsetLng };
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

function generatePassenger(
  userLat: number,
  userLng: number,
  driverRoute: [number, number][],
  driverDestination: { lat: number; lng: number; name: string } | null,
  costPerKm?: number,
): SimulatedPassenger | null {

  // Passenger pickup must be near the driver (≤ ~2km)
  const offsetLat = randomInRange(-0.018, 0.018);
  const offsetLng = randomInRange(-0.022, 0.022);
  const pickupLat = userLat + offsetLat;
  const pickupLng = userLng + offsetLng;

  // Pickup must be ahead of the driver along their route
  if (!isPickupAheadOnRoute(userLat, userLng, pickupLat, pickupLng, driverRoute)) {
    return null;
  }

  // Max detour: ~8km (~10 min at 50 km/h average)
  const detourKmReal = haversineKm(userLat, userLng, pickupLat, pickupLng);
  const maxDetourKm = 8;
  if (detourKmReal > maxDetourKm) return null;

  // Passenger destination must lie on the driver's route (or near final dest)
  const destPoint = findPointNearRoute(driverRoute);
  if (!destPoint) return null;

  const name = PASSENGER_NAMES[Math.floor(Math.random() * PASSENGER_NAMES.length)];
  const distM = haversineKm(userLat, userLng, pickupLat, pickupLng) * 1000;
  const tripDistanceKm = haversineKm(pickupLat, pickupLng, destPoint.lat, destPoint.lng);
  // Minimum trip length so prices aren't nonsense
  if (tripDistanceKm < 2) return null;

  const detourKm = (distM / 1000) * 2;
  const detourMinutes = Math.ceil(randomInRange(2, 8));

  const pricing = calculatePrice({
    distanceKm: tripDistanceKm,
    passengerCount: 1,
    detourKm,
    traffic: 'normal',
    costPerKm,
  });


  return {
    id: crypto.randomUUID(),
    name,
    rating: parseFloat((randomInRange(4.2, 5.0)).toFixed(1)),
    origin: {
      lat: pickupLat,
      lng: pickupLng,
      name: `Calle ${Math.floor(randomInRange(1, 50))}`,
    },
    destination: {
      lat: destPoint.lat,
      lng: destPoint.lng,
      name: nearestCityName(destPoint.lat, destPoint.lng),
    },
    detourMinutes,
    pickupDistance: distM < 1000 ? `${Math.round(distM)}m` : `${(distM / 1000).toFixed(1)}km`,
    compensation: pricing.driverIncome,
    acceptsPets: Math.random() > 0.6,
    hasChildSeat: Math.random() > 0.8,
    doorToDoor: Math.random() > 0.5,
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
}

export function usePassengerSimulation({
  enabled,
  userLocation,
  intervalMs = 8000,
  driverRoute,
  driverDestination,
  costPerKm,
}: UsePassengerSimulationOptions) {
  const [currentPassenger, setCurrentPassenger] = useState<SimulatedPassenger | null>(null);
  const [pendingPassengers, setPendingPassengers] = useState<SimulatedPassenger[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest route/destination available to the interval callback without
  // resetting the timer every time the route updates slightly.
  const routeRef = useRef<[number, number][] | null>(driverRoute ?? null);
  const destRef = useRef<typeof driverDestination>(driverDestination ?? null);
  const costRef = useRef<number | undefined>(costPerKm);
  useEffect(() => { routeRef.current = driverRoute ?? null; }, [driverRoute]);
  useEffect(() => { destRef.current = driverDestination ?? null; }, [driverDestination]);
  useEffect(() => { costRef.current = costPerKm; }, [costPerKm]);

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
    const passenger = generatePassenger(lat, lng, route, destRef.current ?? null, costRef.current);

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
