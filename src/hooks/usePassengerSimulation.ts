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
const DESTINATIONS = [
  { name: 'Zaragoza', lat: 41.6488, lng: -0.8891 },
  { name: 'Jaca', lat: 42.5697, lng: -0.5496 },
  { name: 'Barbastro', lat: 42.0353, lng: 0.1267 },
  { name: 'Monzón', lat: 41.9108, lng: 0.1933 },
  { name: 'Sabiñánigo', lat: 42.5186, lng: -0.3647 },
  { name: 'Teruel', lat: 40.3456, lng: -1.1065 },
  { name: 'Calatayud', lat: 41.3564, lng: -1.6432 },
  { name: 'Fraga', lat: 41.5197, lng: 0.3467 },
  { name: 'Lleida', lat: 41.6176, lng: 0.6200 },
];

// Default fallback coords used by MapView when GPS is unavailable.
// Don't generate passengers if we're sitting on these — wait for real GPS.
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

function generatePassenger(userLat: number, userLng: number): SimulatedPassenger {
  // Generate pickup within ~2km of driver. Lng is stretched slightly more than
  // lat at Spanish latitudes, so we use a wider lng span.
  const offsetLat = randomInRange(-0.020, 0.020);
  const offsetLng = randomInRange(-0.025, 0.025);
  const dest = DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)];
  const name = PASSENGER_NAMES[Math.floor(Math.random() * PASSENGER_NAMES.length)];
  const distM = haversineKm(userLat, userLng, userLat + offsetLat, userLng + offsetLng) * 1000;

  // Trip distance from passenger origin to destination
  const tripDistanceKm = haversineKm(userLat + offsetLat, userLng + offsetLng, dest.lat, dest.lng);
  // Detour ≈ pickup distance from driver, both ways
  const detourKm = (distM / 1000) * 2;
  const detourMinutes = Math.ceil(randomInRange(2, 8));

  // Use VIMATCH formula. Simulation assumes 1 passenger for the popup price.
  const pricing = calculatePrice({
    distanceKm: tripDistanceKm,
    passengerCount: 1,
    detourKm,
    traffic: 'normal',
  });

  return {
    id: crypto.randomUUID(),
    name,
    rating: parseFloat((randomInRange(4.2, 5.0)).toFixed(1)),
    origin: {
      lat: userLat + offsetLat,
      lng: userLng + offsetLng,
      name: `Calle ${Math.floor(randomInRange(1, 50))}`,
    },
    destination: { lat: dest.lat, lng: dest.lng, name: dest.name },
    detourMinutes,
    pickupDistance: distM < 1000 ? `${Math.round(distM)}m` : `${(distM / 1000).toFixed(1)}km`,
    // `compensation` = what the driver receives (basePrice, no commission)
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
}

export function usePassengerSimulation({ enabled, userLocation, intervalMs = 8000 }: UsePassengerSimulationOptions) {
  const [currentPassenger, setCurrentPassenger] = useState<SimulatedPassenger | null>(null);
  const [pendingPassengers, setPendingPassengers] = useState<SimulatedPassenger[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generateNew = useCallback(() => {
    if (!userLocation) return;
    const [lat, lng] = userLocation;
    // Block generation while we're on the hardcoded fallback coords —
    // otherwise passengers spawn in Huesca regardless of where the driver is.
    if (
      Math.abs(lat - FALLBACK_LAT) < 1e-4 &&
      Math.abs(lng - FALLBACK_LNG) < 1e-4
    ) {
      return;
    }
    const passenger = generatePassenger(lat, lng);
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

  // Auto-generate passengers periodically
  useEffect(() => {
    if (!enabled || !userLocation) {
      setCurrentPassenger(null);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // First passenger after 3s
    timerRef.current = setTimeout(() => {
      generateNew();
      // Then every intervalMs
      const interval = setInterval(generateNew, intervalMs);
      timerRef.current = interval as any;
    }, 3000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        clearInterval(timerRef.current as any);
      }
    };
  }, [enabled, userLocation, intervalMs, generateNew]);

  return {
    currentPassenger,
    pendingPassengers,
    generateNew,
    dismissCurrent,
    acceptCurrent,
  };
}
