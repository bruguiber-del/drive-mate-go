import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RecurringTrip {
  id: string;
  destinationName: string;
  destinationLat: number;
  destinationLng: number;
  /** Null = recoger desde donde estés en ese momento, no un punto fijo. */
  originName: string | null;
  originLat: number | null;
  originLng: number | null;
  /** 'HH:MM' */
  departureTime: string;
  /** 0 = domingo .. 6 = sábado */
  daysOfWeek: number[];
  active: boolean;
}

export interface NewRecurringTrip {
  destinationName: string;
  destinationLat: number;
  destinationLng: number;
  originName?: string | null;
  originLat?: number | null;
  originLng?: number | null;
  departureTime: string;
  daysOfWeek: number[];
}

function rowToTrip(row: any): RecurringTrip {
  return {
    id: row.id,
    destinationName: row.destination_name,
    destinationLat: row.destination_lat,
    destinationLng: row.destination_lng,
    originName: row.origin_name,
    originLat: row.origin_lat,
    originLng: row.origin_lng,
    departureTime: row.departure_time,
    daysOfWeek: row.days_of_week ?? [],
    active: row.active,
  };
}

/** Viajes habituales del conductor (CRUD real contra Supabase) — hacen
 *  falta para "todos los días voy de aquí a aquí", algo que un viaje
 *  programado de una sola fecha no cubre. */
export function useRecurringTrips() {
  const [trips, setTrips] = useState<RecurringTrip[]>([]);
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
      .from('recurring_trips')
      .select('*')
      .eq('user_id', uid)
      .order('departure_time', { ascending: true });
    if (!error && data) setTrips(data.map(rowToTrip));
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const addTrip = useCallback(async (trip: NewRecurringTrip) => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) throw new Error('Inicia sesión para guardar un viaje habitual');
    const { error } = await supabase.from('recurring_trips').insert({
      user_id: uid,
      destination_name: trip.destinationName,
      destination_lat: trip.destinationLat,
      destination_lng: trip.destinationLng,
      origin_name: trip.originName ?? null,
      origin_lat: trip.originLat ?? null,
      origin_lng: trip.originLng ?? null,
      departure_time: trip.departureTime,
      days_of_week: trip.daysOfWeek,
    });
    // El error de Supabase no es un Error normal (es un objeto plano con
    // .message) — lanzarlo tal cual hacía que el "instanceof Error" de quien
    // lo capturaba fallara y se perdiera el motivo real, mostrando siempre
    // el mismo aviso genérico.
    if (error) throw new Error(error.message || 'No se pudo guardar el viaje habitual');
    await reload();
  }, [reload]);

  const toggleActive = useCallback(async (id: string, active: boolean) => {
    setTrips((prev) => prev.map((t) => (t.id === id ? { ...t, active } : t)));
    const { error } = await supabase.from('recurring_trips').update({ active }).eq('id', id);
    if (error) await reload();
  }, [reload]);

  const removeTrip = useCallback(async (id: string) => {
    setTrips((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from('recurring_trips').delete().eq('id', id);
    if (error) await reload();
  }, [reload]);

  return { trips, isAuthenticated, loading, addTrip, toggleActive, removeTrip };
}
