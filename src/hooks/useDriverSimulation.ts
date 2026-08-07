import { useState, useCallback } from 'react';
import { calculatePrice } from '@/lib/priceCalculator';

export interface SimulatedDriver {
  id: string;
  name: string;
  rating: number;
  vehicle: {
    brand: string;
    model: string;
    color: string;
    licensePlate: string;
  };
  /** Minutes until the driver reaches the meeting point */
  etaMinutes: number;
  /** Human readable distance to the passenger */
  distanceLabel: string;
  /** Base cost shared with the driver (before commission) */
  basePrice: number;
  /** VIMATCH commission (12%) */
  commission: number;
  /** Total the passenger pays */
  totalPrice: number;
  acceptsPets: boolean;
  hasChildSeat: boolean;
}

const DRIVER_NAMES = [
  'Carlos G.', 'Miguel A.', 'Elena R.', 'Sofía L.', 'Javier P.',
  'Nuria B.', 'Andrés M.', 'Raquel D.', 'Iván S.', 'Cristina O.',
];

const VEHICLES = [
  { brand: 'Seat', model: 'León', color: 'Gris' },
  { brand: 'Volkswagen', model: 'Golf', color: 'Azul' },
  { brand: 'Renault', model: 'Clio', color: 'Blanco' },
  { brand: 'Toyota', model: 'Corolla Hybrid', color: 'Negro' },
  { brand: 'Peugeot', model: '308 BlueHDi', color: 'Rojo' },
  { brand: 'Nissan', model: 'Qashqai', color: 'Gris' },
  { brand: 'Kia', model: 'Niro', color: 'Blanco' },
  { brand: 'Citroën', model: 'C4', color: 'Azul' },
];

const PLATE_LETTERS = 'BCDFGHJKLMNPRSTVWXYZ';

function randomPlate(): string {
  const digits = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  let letters = '';
  for (let i = 0; i < 3; i++) {
    letters += PLATE_LETTERS[Math.floor(Math.random() * PLATE_LETTERS.length)];
  }
  return `${digits} ${letters}`;
}

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function generateSimulatedDriver(tripDistanceKm = 12): SimulatedDriver {
  const vehicle = VEHICLES[Math.floor(Math.random() * VEHICLES.length)];
  const pricing = calculatePrice({
    distanceKm: tripDistanceKm,
    passengerCount: 1,
    traffic: 'normal',
  });
  const distanceM = Math.round(randomInRange(200, 2000));

  return {
    id: crypto.randomUUID(),
    name: DRIVER_NAMES[Math.floor(Math.random() * DRIVER_NAMES.length)],
    rating: parseFloat(randomInRange(4.2, 5.0).toFixed(1)),
    vehicle: { ...vehicle, licensePlate: randomPlate() },
    etaMinutes: Math.round(randomInRange(3, 8)),
    distanceLabel: distanceM < 1000 ? `${distanceM}m` : `${(distanceM / 1000).toFixed(1)}km`,
    basePrice: pricing.driverIncome,
    commission: pricing.commissionAmount,
    totalPrice: pricing.passengerPrice,
    acceptsPets: Math.random() > 0.5,
    hasChildSeat: Math.random() > 0.75,
  };
}

export function useDriverSimulation() {
  const [currentDriver, setCurrentDriver] = useState<SimulatedDriver | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const searchDriver = useCallback((tripDistanceKm?: number) => {
    const driver = generateSimulatedDriver(tripDistanceKm);
    setCurrentDriver(driver);
    return driver;
  }, []);

  const clearDriver = useCallback(() => setCurrentDriver(null), []);

  return { currentDriver, isSearching, setIsSearching, searchDriver, clearDriver };
}
