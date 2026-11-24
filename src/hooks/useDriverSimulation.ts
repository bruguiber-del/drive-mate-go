import { useState, useCallback } from 'react';

export interface SimulatedDriver {
  id: string;
  name: string;
  gender: 'women' | 'men';
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
  /** Lo mismo que distanceLabel pero en metros, sin parsear texto — para
   *  poder inventarle al conductor un punto de partida real a esa distancia
   *  y animarlo acercándose en el mapa del pasajero. */
  pickupDistanceMeters: number;
  /** Base cost shared with the driver (before commission) */
  basePrice: number;
  /** VIMATCH commission (12%) */
  commission: number;
  /** Total the passenger pays */
  totalPrice: number;
  acceptsPets: boolean;
  hasChildSeat: boolean;
  /** Si este conductor concreto hace puerta a puerta — independiente de lo
   *  que pida el pasajero, para que exigirlo de verdad filtre con quién te
   *  emparejas (antes se guardaba la preferencia pero no descartaba a nadie). */
  doorToDoor: boolean;
}

/** Lo que el pasajero pidió en sus ajustes — antes se guardaba pero nunca
 *  filtraba con quién se le emparejaba. */
export interface PassengerMatchPreferences {
  hasPet: boolean;
  needsChildSeat: boolean;
  genderPreference: 'none' | 'women' | 'men';
}

// El emparejamiento es real (useRealDriverSearch) — este hook ya no genera
// conductores inventados, solo guarda el conductor real encontrado con el
// mismo molde (SimulatedDriver) que usaba el antiguo generador, para que
// todo lo que ya lee driverSim.currentDriver en Index.tsx (el mapa, el
// ticket, el ETA...) funcione igual sin tocarlo.
export function useDriverSimulation() {
  const [currentDriver, setCurrentDriver] = useState<SimulatedDriver | null>(null);

  const clearDriver = useCallback(() => setCurrentDriver(null), []);

  const setRealDriver = useCallback((driver: SimulatedDriver) => setCurrentDriver(driver), []);

  // El conductor recalcula el precio de todos los que lleva a bordo cada
  // vez que sube o baja alguien — esto es lo que deja que ese nuevo precio
  // le llegue de verdad al pasajero mientras el viaje ya está en marcha,
  // sin tener que volver a emparejar ni recargar nada.
  const updateRealDriverPrice = useCallback((totalPrice: number) => {
    setCurrentDriver((prev) => (prev ? { ...prev, totalPrice, basePrice: totalPrice } : prev));
  }, []);

  return { currentDriver, setRealDriver, updateRealDriverPrice, clearDriver };
}
