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

        setTrips(
          data.map((t) => ({
            id: t.id,
            role: t.driver_id === uid ? 'driver' : 'passenger',
            status: t.status,
            price: t.price === null || t.price === undefined ? null : Number(t.price),
            originName: t.origin_name ?? null,
            destinationName: t.destination_name ?? null,
            rating: t.rating ?? null,
            createdAt: t.created_at,
            completedAt: t.completed_at ?? null,
            scheduledAt: t.scheduled_at ?? null,
          })),
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
