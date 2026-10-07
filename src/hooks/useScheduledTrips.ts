import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ScheduledTrip {
  id: string;
  destinationName: string;
  destinationLat: number;
  destinationLng: number;
  originName: string | null;
  originLat: number | null;
  originLng: number | null;
  /** ISO completo — fecha y hora concretas, a diferencia de un viaje habitual. */
  scheduledAt: string;
}

export interface NewScheduledTrip {
  destinationName: string;
  destinationLat: number;
  destinationLng: number;
  originName?: string | null;
  originLat?: number | null;
  originLng?: number | null;
  scheduledAt: string;
}

function rowToTrip(row: any): ScheduledTrip {
  return {
    id: row.id,
    destinationName: row.destination_name ?? '',
    destinationLat: row.destination_lat,
    destinationLng: row.destination_lng,
    originName: row.origin_name,
    originLat: row.origin_lat,
    originLng: row.origin_lng,
    scheduledAt: row.scheduled_at,
  };
}

/** Viajes de conductor para una fecha y hora concretas (no repiten) — misma
 *  tabla `trips` que ya usa el pasajero para programar, con passenger_id a
 *  null porque todavía no hay nadie emparejado. */
export function useScheduledTrips() {
  const [trips, setTrips] = useState<ScheduledTrip[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    setIsAuthenticated(!!uid);
    if (!uid) {
      setTrips([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .eq('driver_id', uid)
      .is('passenger_id', null)
      .eq('status', 'scheduled')
      // Los que ya pasaron no se cancelan ni se borran (quedan como
      // registro), pero tampoco tiene sentido seguir mostrándolos en la lista.
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true });
    if (!error && data) setTrips(data.map(rowToTrip));
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const addTrip = useCallback(async (trip: NewScheduledTrip) => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) throw new Error('Inicia sesión para programar un viaje');
    const { error } = await supabase.from('trips').insert({
      driver_id: uid,
      passenger_id: null,
      status: 'scheduled',
      scheduled_at: trip.scheduledAt,
      destination_name: trip.destinationName,
      destination_lat: trip.destinationLat,
      destination_lng: trip.destinationLng,
      origin_name: trip.originName ?? null,
      origin_lat: trip.originLat ?? null,
      origin_lng: trip.originLng ?? null,
    });
    if (error) throw new Error(error.message || 'No se pudo programar el viaje');
    await reload();
  }, [reload]);

  const cancelTrip = useCallback(async (id: string) => {
    setTrips((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from('trips').update({ status: 'cancelled' }).eq('id', id);
    if (error) await reload();
  }, [reload]);

  return { trips, isAuthenticated, loading, addTrip, cancelTrip };
}
