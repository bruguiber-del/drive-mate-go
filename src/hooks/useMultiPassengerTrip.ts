import { useState, useCallback, useMemo } from 'react';
import {
  clusterPlannedStops,
  findOptimalStopOrder,
  type PlannedStop,
  type StopKind,
} from '@/lib/multiStopPlanning';
import type { SimulatedPassenger } from '@/hooks/usePassengerSimulation';
import { calculatePrice } from '@/lib/priceCalculator';

export type PassengerTripStatus = 'waiting_pickup' | 'in_car';

export interface TrackedPassenger {
  passenger: SimulatedPassenger;
  status: PassengerTripStatus;
}

/** El reparto (coste / (pasajeros+1)) depende de cuántos van en el coche EN
 *  ESE MOMENTO — así que si sube o baja alguien, el precio de TODOS los
 *  demás tiene que recalcularse con la nueva ocupación, no quedarse
 *  congelado con el que tenían al emparejar. Antes el precio nunca se
 *  tocaba después de aceptarlo. */
function recomputeCompensation(
  entries: Record<string, TrackedPassenger>,
): Record<string, TrackedPassenger> {
  const passengerCount = Math.min(4, Math.max(1, Object.keys(entries).length)) as 1 | 2 | 3 | 4;
  const next: Record<string, TrackedPassenger> = {};
  for (const [id, tracked] of Object.entries(entries)) {
    const p = tracked.passenger;
    const pricing = calculatePrice({
      distanceKm: p.tripDistanceKm,
      detourKm: p.detourKm,
      passengerCount,
      traffic: 'normal',
      costPerKm: p.costPerKm,
      hasPet: p.acceptsPets,
      hasChildSeat: p.hasChildSeat,
    });
    next[id] = {
      ...tracked,
      passenger: {
        ...p,
        compensation: pricing.driverIncome,
        receipt: {
          passengerPrice: pricing.passengerPrice,
          totalCost: pricing.totalCost,
          occupants: passengerCount + 1,
          tripShare: pricing.tripShare,
          detourCharge: pricing.detourCharge,
          extrasSurcharge: pricing.extrasSurcharge,
          commissionAmount: pricing.commissionAmount,
          driverCommissionShare: pricing.driverCommissionShare,
        },
      },
    };
  }
  return next;
}

interface UseMultiPassengerTripOptions {
  /** Plazas del vehículo activo — límite duro de pasajeros simultáneos. */
  seats: number;
}

/**
 * Lleva la cuenta de varios pasajeros a bordo a la vez (hasta `seats`),
 * calcula el orden de paradas restante con multiStopPlanning, y libera la
 * plaza en el momento exacto en que se confirma la bajada de cada uno —
 * no al terminar el viaje completo — para que pueda entrar otra solicitud
 * de inmediato, incluso en la misma parada.
 */
export function useMultiPassengerTrip({ seats }: UseMultiPassengerTripOptions) {
  const [tracked, setTracked] = useState<Record<string, TrackedPassenger>>({});

  const passengers = useMemo(() => Object.values(tracked), [tracked]);

  // Una plaza se reserva desde el momento de ACEPTAR, no solo al recoger de
  // verdad — si no, se podría comprometer el coche a más gente de la que
  // caben mientras van de camino a la primera recogida.
  const freeSeats = Math.max(0, seats - passengers.length);

  const acceptPassenger = useCallback(
    (passenger: SimulatedPassenger) => {
      setTracked((prev) => {
        if (Object.keys(prev).length >= seats) return prev;
        if (prev[passenger.id]) return prev;
        const withNew: Record<string, TrackedPassenger> = {
          ...prev,
          [passenger.id]: { passenger, status: 'waiting_pickup' },
        };
        return recomputeCompensation(withNew);
      });
    },
    [seats],
  );

  /** Orden de paradas restante, recalculado cada vez que cambian los pasajeros. */
  const stops = useCallback(
    (driverPosition: { lat: number; lng: number } | null): PlannedStop[] => {
      if (passengers.length === 0) return [];

      const raw: Array<{ kind: StopKind; lat: number; lng: number; passengerId: string; passengerName: string }> = [];
      const alreadyPickedUp = new Set<string>();

      for (const { passenger, status } of passengers) {
        if (status === 'waiting_pickup') {
          raw.push({
            kind: 'pickup',
            lat: passenger.origin.lat,
            lng: passenger.origin.lng,
            passengerId: passenger.id,
            passengerName: passenger.name,
          });
        } else {
          alreadyPickedUp.add(passenger.id);
        }
        raw.push({
          kind: 'dropoff',
          lat: passenger.destination.lat,
          lng: passenger.destination.lng,
          passengerId: passenger.id,
          passengerName: passenger.name,
        });
      }

      const clustered = clusterPlannedStops(raw);
      if (!driverPosition) return clustered;
      return findOptimalStopOrder(driverPosition, clustered, alreadyPickedUp);
    },
    [passengers],
  );

  /** Marca como recogidos a todos los pasajeros que comparten esta parada. */
  const confirmPickup = useCallback((passengerIds: string[]) => {
    setTracked((prev) => {
      const next = { ...prev };
      for (const id of passengerIds) {
        if (next[id]) next[id] = { ...next[id], status: 'in_car' };
      }
      return next;
    });
  }, []);

  /** Baja a todos los pasajeros de esta parada — libera sus plazas ya mismo. */
  const confirmDropoff = useCallback((passengerIds: string[]) => {
    setTracked((prev) => {
      const next = { ...prev };
      for (const id of passengerIds) delete next[id];
      return recomputeCompensation(next);
    });
  }, []);

  const reset = useCallback(() => setTracked({}), []);

  return {
    passengers,
    freeSeats,
    occupiedSeats: passengers.length,
    acceptPassenger,
    stops,
    confirmPickup,
    confirmDropoff,
    reset,
  };
}
