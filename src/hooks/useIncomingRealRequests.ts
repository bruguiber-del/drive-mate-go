import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchRealRoute } from '@/lib/mapboxDirections';
import { calculatePrice } from '@/lib/priceCalculator';
import {
  verifyRealDetour,
  type SimulatedPassenger,
  type ActiveTrackedPassenger,
} from '@/hooks/usePassengerSimulation';

interface TripPassengerRow {
  id: string;
  trip_id: string;
  passenger_id: string;
  passenger_name: string;
  origin_name: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_name: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  status: string;
}

interface UseIncomingRealRequestsOptions {
  enabled: boolean;
  tripId: string | null;
  userLocation: [number, number] | null;
  driverRoute?: [number, number][] | null;
  driverDestination?: { lat: number; lng: number; name: string } | null;
  costPerKm?: number;
  maxDetourMinutes?: number;
  activeTrackedPassengers?: ActiveTrackedPassenger[];
  seats?: number;
}

/**
 * Lado conductor del emparejamiento real: escucha (Realtime) peticiones
 * nuevas de pasajeros reales en el propio viaje activo, mide el desvío de
 * verdad (misma geometría que usa la simulación) y, si cabe, la ofrece
 * para aceptar/rechazar con la MISMA forma (SimulatedPassenger) que ya
 * usa todo el flujo de aceptación — así no hace falta tocar ese flujo.
 */
export function useIncomingRealRequests({
  enabled,
  tripId,
  userLocation,
  driverRoute,
  driverDestination,
  costPerKm,
  maxDetourMinutes,
  activeTrackedPassengers,
  seats = 1,
}: UseIncomingRealRequestsOptions) {
  const [currentRequest, setCurrentRequest] = useState<SimulatedPassenger | null>(null);
  const processingRef = useRef<Set<string>>(new Set());

  const locationRef = useRef(userLocation);
  useEffect(() => { locationRef.current = userLocation; }, [userLocation]);
  const routeRef = useRef(driverRoute);
  useEffect(() => { routeRef.current = driverRoute; }, [driverRoute]);
  const destRef = useRef(driverDestination);
  useEffect(() => { destRef.current = driverDestination; }, [driverDestination]);
  const costRef = useRef(costPerKm);
  useEffect(() => { costRef.current = costPerKm; }, [costPerKm]);
  const maxDetourRef = useRef(maxDetourMinutes);
  useEffect(() => { maxDetourRef.current = maxDetourMinutes; }, [maxDetourMinutes]);
  const trackedRef = useRef(activeTrackedPassengers ?? []);
  useEffect(() => { trackedRef.current = activeTrackedPassengers ?? []; }, [activeTrackedPassengers]);
  const seatsRef = useRef(seats);
  useEffect(() => { seatsRef.current = seats; }, [seats]);

  const handleNewRow = useCallback(async (row: TripPassengerRow) => {
    if (processingRef.current.has(row.id)) return;
    processingRef.current.add(row.id);
    try {
      const loc = locationRef.current;
      const route = routeRef.current;
      if (!loc || !route || route.length < 2) return;
      if (row.origin_lat == null || row.origin_lng == null || row.destination_lat == null || row.destination_lng == null) return;
      if (trackedRef.current.length >= seatsRef.current) return;

      const draft = {
        pickupLat: row.origin_lat,
        pickupLng: row.origin_lng,
        destLat: row.destination_lat,
        destLng: row.destination_lng,
        name: row.passenger_name,
        gender: 'women' as const,
        rating: 5,
        pickupDistanceLabel: '',
        tripDistanceKm: 0,
        acceptsPets: false,
        hasChildSeat: false,
        doorToDoor: true,
      };

      const [lat, lng] = loc;
      const [verified, tripReal] = await Promise.all([
        verifyRealDetour(lat, lng, draft, row.id, trackedRef.current, destRef.current ?? null, maxDetourRef.current),
        fetchRealRoute([
          { lat: draft.pickupLat, lng: draft.pickupLng },
          { lat: draft.destLat, lng: draft.destLng },
        ]),
      ]);

      if (verified.kind !== 'ok' || !tripReal) {
        // No cabe en la ruta (o se desvía demasiado) — se rechaza sola, sin
        // molestar al conductor con algo que no iba a aceptar de todas
        // formas.
        await supabase.from('trip_passengers').update({ status: 'rejected' }).eq('id', row.id);
        return;
      }

      const tripDistanceKm = tripReal.distanceM / 1000;
      const liveOccupancy = Math.min(seatsRef.current, trackedRef.current.length + 1);
      const passengerCount = Math.min(4, Math.max(1, liveOccupancy)) as 1 | 2 | 3 | 4;
      const pricing = calculatePrice({
        distanceKm: tripDistanceKm,
        detourKm: verified.detourKm,
        passengerCount,
        traffic: 'normal',
        costPerKm: costRef.current,
      });

      const passenger: SimulatedPassenger = {
        id: row.id,
        name: row.passenger_name,
        gender: 'women',
        rating: 5,
        origin: { lat: row.origin_lat, lng: row.origin_lng, name: row.origin_name ?? 'Punto de recogida' },
        destination: { lat: row.destination_lat, lng: row.destination_lng, name: row.destination_name ?? 'Destino' },
        detourMinutes: verified.detourMinutes,
        pickupDistance: '',
        compensation: pricing.driverIncome,
        tripDistanceKm,
        detourKm: verified.detourKm,
        routeTotalDurationS: verified.routeTotalDurationS,
        acceptsPets: false,
        hasChildSeat: false,
        doorToDoor: true,
        costPerKm: pricing.totalCost / tripDistanceKm,
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
        realRequestId: row.id,
        realPassengerId: row.passenger_id,
      };

      setCurrentRequest(passenger);
    } finally {
      processingRef.current.delete(row.id);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !tripId) {
      setCurrentRequest(null);
      return;
    }

    const channel = supabase
      .channel(`incoming-requests-${tripId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trip_passengers', filter: `trip_id=eq.${tripId}` },
        (payload) => {
          const row = payload.new as TripPassengerRow;
          if (row.status === 'requested') handleNewRow(row);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, tripId, handleNewRow]);

  const dismissCurrent = useCallback(() => setCurrentRequest(null), []);

  const rejectCurrent = useCallback(() => {
    if (currentRequest?.realRequestId) {
      supabase.from('trip_passengers').update({ status: 'rejected' }).eq('id', currentRequest.realRequestId).then(() => {}, () => {});
    }
    setCurrentRequest(null);
  }, [currentRequest]);

  return { currentRequest, dismissCurrent, rejectCurrent };
}
