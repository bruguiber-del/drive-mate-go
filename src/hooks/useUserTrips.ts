import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface UserTrip {
  id: string;
  role: 'driver' | 'passenger';
  status: string;
  price: number | null;
  originName: string | null;
  destinationName: string | null;
  rating: number | null;
  createdAt: string;
  completedAt: string | null;
  scheduledAt: string | null;
  /** Solo en role === 'driver': cuántos pasajeros de verdad llevaste (con
   *  precio real, no una petición rechazada/cancelada) — para distinguir
   *  un viaje compartido de uno en solitario. trips.price por sí solo no
   *  bastaba: es del diseño antiguo de un único pasajero, y el
   *  emparejamiento real multi-pasajero guarda el precio de cada uno en
   *  trip_passengers, no ahí. */
  realPassengerCount?: number;
}

interface UseUserTripsResult {
  trips: UserTrip[];
  isAuthenticated: boolean;
  loading: boolean;
}

/**
 * Reads the signed-in user's real trips. When there is no session the hook
 * returns an empty list with isAuthenticated=false so callers can keep showing
 * their existing sample/empty state without breaking.
 */
export function useUserTrips(enabled: boolean): UseUserTripsResult {
  const [trips, setTrips] = useState<UserTrip[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (cancelled) return;
        setIsAuthenticated(!!uid);
        if (!uid) {
          setTrips([]);
          return;
        }

        const { data, error } = await supabase
          .from('trips')
          .select('*')
          .or(`driver_id.eq.${uid},passenger_id.eq.${uid}`)
          .order('created_at', { ascending: false })
          .limit(50);

        if (cancelled || error || !data) return;

        // Para tus viajes como conductor, el precio/nº de pasajeros real
        // vive en trip_passengers (uno por pasajero, con su propio
        // precio) — trips.price es del diseño antiguo de un único
        // pasajero y no refleja bien un viaje con varios compartiéndolo.
        const driverTripIds = data.filter((t) => t.driver_id === uid).map((t) => t.id);
        const realPriceByTrip = new Map<string, number>();
        const realCountByTrip = new Map<string, number>();
        if (driverTripIds.length > 0) {
          const { data: passengerRows } = await supabase
            .from('trip_passengers')
            .select('trip_id, price')
            .in('trip_id', driverTripIds)
            .gt('price', 0);
          for (const row of passengerRows ?? []) {
            realPriceByTrip.set(row.trip_id, (realPriceByTrip.get(row.trip_id) ?? 0) + (row.price ?? 0));
            realCountByTrip.set(row.trip_id, (realCountByTrip.get(row.trip_id) ?? 0) + 1);
          }
        }

        setTrips(
          data.map((t) => {
            const isDriver = t.driver_id === uid;
            const realPrice = isDriver ? realPriceByTrip.get(t.id) : undefined;
            const realCount = isDriver ? realCountByTrip.get(t.id) : undefined;
            const legacyPrice = t.price === null || t.price === undefined ? null : Number(t.price);
            // Un viaje viejo (de antes del emparejamiento multi-pasajero
            // real) guardaba su único pasajero directamente en
            // trips.passenger_id/trips.price, sin ninguna fila en
            // trip_passengers — sin este caso se contaría como "en
            // solitario" aunque de verdad llevara a alguien.
            const isLegacySharedTrip = isDriver && !realCount && !!t.passenger_id && !!legacyPrice && legacyPrice > 0;
            return {
              id: t.id,
              role: isDriver ? 'driver' : 'passenger',
              status: t.status,
              price: realPrice ?? legacyPrice,
              originName: t.origin_name ?? null,
              destinationName: t.destination_name ?? null,
              rating: t.rating ?? null,
              createdAt: t.created_at,
              completedAt: t.completed_at ?? null,
              scheduledAt: t.scheduled_at ?? null,
              realPassengerCount: isDriver ? (realCount ?? (isLegacySharedTrip ? 1 : 0)) : undefined,
            };
          }),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { trips, isAuthenticated, loading };
}

export const formatTripDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatTripTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
