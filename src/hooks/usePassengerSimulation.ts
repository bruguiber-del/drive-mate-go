import { useState, useEffect, useCallback, useRef } from 'react';

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
];

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function generatePassenger(userLat: number, userLng: number): SimulatedPassenger {
  // Generate pickup within 0.5-3km of driver
  const offsetLat = randomInRange(-0.015, 0.015);
  const offsetLng = randomInRange(-0.015, 0.015);
  const dest = DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)];
  const name = PASSENGER_NAMES[Math.floor(Math.random() * PASSENGER_NAMES.length)];
  const distM = Math.sqrt(offsetLat ** 2 + offsetLng ** 2) * 111000;

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
    detourMinutes: Math.ceil(randomInRange(2, 8)),
    pickupDistance: distM < 1000 ? `${Math.round(distM)}m` : `${(distM / 1000).toFixed(1)}km`,
    compensation: parseFloat(randomInRange(3, 12).toFixed(2)),
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
    const passenger = generatePassenger(userLocation[0], userLocation[1]);
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
