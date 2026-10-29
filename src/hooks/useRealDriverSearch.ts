import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { haversineKm } from '@/lib/geo';
import type { SimulatedDriver, PassengerMatchPreferences } from '@/hooks/useDriverSimulation';

export const REAL_SEARCH_RADIUS_KM = { initial: 3, expanded: 8 } as const;
const POLL_INTERVAL_MS = 8000;
const REQUEST_TIMEOUT_MS = 25_000;
const RECENT_LOCATION_MS = 30_000;

export type RealSearchPhase = 'idle' | 'searching' | 'matched' | 'not_found';

interface TripCandidateRow {
  id: string;
  driver_id: string;
  driver_lat: number | null;
  driver_lng: number | null;
  free_seats: number | null;
  location_updated_at: string | null;
}

interface UseRealDriverSearchOptions {
  enabled: boolean;
  userLocation: [number, number] | null;
  destination: { lat: number; lng: number; name: string } | null;
  originName: string;
  passengerName: string;
  preferences?: PassengerMatchPreferences;
  onMatched: (realTripId: string, driver: SimulatedDriver) => void;
}

/**
 * Lado pasajero del emparejamiento real: busca viajes activos cercanos de
 * verdad (trips.status='active' con posición reciente), pide subirse al
 * más cercano y espera a que el conductor responda. Al aceptar, construye
 * un SimulatedDriver con datos reales (vehículo, valoración) para que todo
 * lo que ya lee driverSim.currentDriver siga funcionando sin tocarlo.
 */
export function useRealDriverSearch({
  enabled,
  userLocation,
  destination,
  originName,
  passengerName,
  preferences,
  onMatched,
}: UseRealDriverSearchOptions) {
  const [phase, setPhase] = useState<RealSearchPhase>('idle');
  const [radiusKm, setRadiusKm] = useState<number>(REAL_SEARCH_RADIUS_KM.initial);
  const attemptedTripIdsRef = useRef<Set<string>>(new Set());
  const pendingRowIdRef = useRef<string | null>(null);
  // Además de la ref (para que el polling, que no depende de esto, siempre
  // lea el valor último), hace falta este estado: sin él, el efecto de más
  // abajo que escucha la respuesta del conductor nunca se vuelve a
  // ejecutar cuando se crea una petición nueva (una ref no dispara
  // renders), así que nunca llegaba a suscribirse a tiempo.
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  // El conductor más cercano visto en la última ronda de búsqueda — para
  // que el pasajero vea en el mapa que hay alguien cerca mientras espera,
  // no solo el punto de recogida. Antes no se enseñaba nada hasta
  // emparejar de verdad.
  const [nearestCandidate, setNearestCandidate] = useState<{ lat: number; lng: number } | null>(null);
  const elapsedMsRef = useRef(0);
  const onMatchedRef = useRef(onMatched);
  useEffect(() => { onMatchedRef.current = onMatched; }, [onMatched]);

  // `passengerPriceEur`: lo que de verdad va a pagar, calculado por el
  // conductor con la ocupación real en el momento de aceptar (receipt.
  // passengerPrice, guardado en trip_passengers.price) — antes aquí se
  // inventaba un precio con un trayecto de 10km y un único pasajero fijos,
  // así que el pasajero veía un número sin ninguna relación con su viaje
  // real ni con cuánta gente más iba compartiéndolo.
  const resolveMatch = useCallback(async (tripId: string, passengerPriceEur: number | null) => {
    const { data: trip } = await supabase.from('trips').select('driver_id').eq('id', tripId).maybeSingle();
    if (!trip) return;
    const [{ data: driverProfile }, { data: vehicle }] = await Promise.all([
      supabase.from('profiles').select('full_name, average_rating').eq('id', trip.driver_id).maybeSingle(),
      supabase
        .from('vehicles')
        .select('brand, model, license_plate')
        .eq('user_id', trip.driver_id)
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    const price = passengerPriceEur ?? 0;
    const driver: SimulatedDriver = {
      id: trip.driver_id,
      name: driverProfile?.full_name ?? 'Conductor',
      gender: 'men',
      rating: driverProfile?.average_rating ?? 5,
      vehicle: {
        brand: vehicle?.brand ?? '',
        model: vehicle?.model ?? '',
        color: '',
        licensePlate: vehicle?.license_plate ?? '',
      },
      etaMinutes: 5,
      distanceLabel: '',
      pickupDistanceMeters: 0,
      basePrice: price,
      commission: 0,
      totalPrice: price,
      acceptsPets: true,
      hasChildSeat: true,
      doorToDoor: true,
    };
    setPhase('matched');
    onMatchedRef.current(tripId, driver);
  }, []);

  // Vigila la fila pendiente hasta que el conductor la acepte o la
  // rechace, o hasta que pase demasiado tiempo sin respuesta.
  useEffect(() => {
    if (!enabled || phase !== 'searching' || !pendingRowId) return;
    const rowId = pendingRowId;

    const channel = supabase
      .channel(`request-status-${rowId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trip_passengers', filter: `id=eq.${rowId}` },
        (payload) => {
          const row = payload.new as { status: string; trip_id: string; price: number | null };
          if (row.status === 'waiting_pickup') {
            resolveMatch(row.trip_id, row.price);
          } else if (row.status === 'rejected') {
            pendingRowIdRef.current = null;
            setPendingRowId(null);
          }
        },
      )
      .subscribe();

    const timeout = setTimeout(() => {
      if (pendingRowIdRef.current === rowId) {
        supabase.from('trip_passengers').update({ status: 'cancelled' }).eq('id', rowId).then(() => {}, () => {});
        pendingRowIdRef.current = null;
        setPendingRowId(null);
      }
    }, REQUEST_TIMEOUT_MS);

    return () => {
      supabase.removeChannel(channel);
      clearTimeout(timeout);
    };
  }, [enabled, phase, pendingRowId, resolveMatch]);

  // Busca y pide subirse al conductor activo más cercano que no se haya
  // intentado ya.
  useEffect(() => {
    if (!enabled) {
      setPhase('idle');
      attemptedTripIdsRef.current.clear();
      pendingRowIdRef.current = null;
      setPendingRowId(null);
      setNearestCandidate(null);
      elapsedMsRef.current = 0;
      setRadiusKm(REAL_SEARCH_RADIUS_KM.initial);
      return;
    }
    setPhase('searching');

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      const loc = userLocation;
      if (!loc) return;

      const { data: candidates } = await supabase
        .from('trips')
        .select('id, driver_id, driver_lat, driver_lng, free_seats, location_updated_at')
        .eq('status', 'active')
        .not('driver_lat', 'is', null)
        .gte('location_updated_at', new Date(Date.now() - RECENT_LOCATION_MS).toISOString());

      if (cancelled || !candidates) return;

      const withDistance = (candidates as TripCandidateRow[])
        .map((c) => ({ c, distanceKm: haversineKm(loc[0], loc[1], c.driver_lat!, c.driver_lng!) }))
        .sort((a, b) => a.distanceKm - b.distanceKm);

      // Se actualiza siempre, aunque ya haya una petición enviada a otro
      // conductor — para que el mapa del pasajero no se quede congelado
      // mientras espera respuesta.
      setNearestCandidate(
        withDistance.length > 0 ? { lat: withDistance[0].c.driver_lat!, lng: withDistance[0].c.driver_lng! } : null,
      );

      if (pendingRowIdRef.current) return; // ya hay una petición en curso

      elapsedMsRef.current += POLL_INTERVAL_MS;
      const currentRadius = elapsedMsRef.current >= 45_000 ? REAL_SEARCH_RADIUS_KM.expanded : REAL_SEARCH_RADIUS_KM.initial;
      setRadiusKm(currentRadius);

      const nearby = withDistance
        .filter((x) => !attemptedTripIdsRef.current.has(x.c.id))
        .filter((x) => x.c.free_seats == null || x.c.free_seats > 0)
        .filter((x) => x.distanceKm <= currentRadius);

      if (nearby.length === 0) {
        if (elapsedMsRef.current >= 120_000) setPhase('not_found');
        return;
      }

      const best = nearby[0].c;
      attemptedTripIdsRef.current.add(best.id);

      const { data: userData } = await supabase.auth.getUser();
      const passengerId = userData?.user?.id;
      if (!passengerId) return;

      const { data: row, error } = await supabase
        .from('trip_passengers')
        .insert({
          trip_id: best.id,
          passenger_id: passengerId,
          passenger_name: passengerName || 'Pasajero',
          origin_name: originName,
          origin_lat: loc[0],
          origin_lng: loc[1],
          destination_name: destination?.name ?? null,
          destination_lat: destination?.lat ?? null,
          destination_lng: destination?.lng ?? null,
          status: 'requested',
        })
        .select('id')
        .single();

      if (!error && row?.id) {
        pendingRowIdRef.current = row.id;
        setPendingRowId(row.id);
        // Para que el conductor se entere aunque no tenga la app abierta
        // mirando la pantalla — si falla (p.ej. no tiene push activado),
        // no pasa nada, simplemente no le llega el aviso.
        supabase.functions
          .invoke('send-push-notification', {
            body: {
              tripId: best.id,
              targetUserId: best.driver_id,
              title: 'Nueva petición de viaje',
              body: `${passengerName || 'Un pasajero'} quiere subirse`,
              tag: 'new-request',
            },
          })
          .then(() => {}, () => {});
      }
    };

    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, destination?.lat, destination?.lng, originName, passengerName]);

  const retry = useCallback(() => {
    attemptedTripIdsRef.current.clear();
    pendingRowIdRef.current = null;
    setPendingRowId(null);
    elapsedMsRef.current = 0;
    setRadiusKm(REAL_SEARCH_RADIUS_KM.initial);
    setPhase('searching');
  }, []);

  const cancelPending = useCallback(() => {
    if (pendingRowIdRef.current) {
      supabase.from('trip_passengers').update({ status: 'cancelled' }).eq('id', pendingRowIdRef.current).then(() => {}, () => {});
      pendingRowIdRef.current = null;
      setPendingRowId(null);
    }
  }, []);

  return { phase, radiusKm, retry, cancelPending, nearestCandidate, matchedRequestId: pendingRowId };
}
