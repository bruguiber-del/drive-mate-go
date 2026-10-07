import { useEffect, useMemo, useState } from 'react';
import { useScheduledTrips, type ScheduledTrip } from '@/hooks/useScheduledTrips';

/** Mismo margen que los viajes habituales: avisa desde 30 min antes hasta
 *  15 min después, por si se abre la app un poco tarde. */
const WINDOW_BEFORE_MIN = 30;
const WINDOW_AFTER_MIN = 15;

/** Pura y testeable: ¿toca avisar de este viaje puntual ahora mismo? */
export function isScheduledTripDueNow(trip: Pick<ScheduledTrip, 'scheduledAt'>, now: Date): boolean {
  const diffMin = (new Date(trip.scheduledAt).getTime() - now.getTime()) / 60_000;
  return diffMin <= WINDOW_BEFORE_MIN && diffMin >= -WINDOW_AFTER_MIN;
}

/** Igual que los viajes habituales pero para una fecha y hora concretas —
 *  lo ofrece con un toque, nunca arranca solo. */
export function useScheduledTripReminder(enabled: boolean) {
  const { trips } = useScheduledTrips();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [enabled]);

  const upcoming = useMemo<ScheduledTrip | null>(() => {
    if (!enabled) return null;
    const now = new Date();
    for (const t of trips) {
      if (dismissedIds.has(t.id)) continue;
      if (isScheduledTripDueNow(t, now)) return t;
    }
    return null;
    // `tick` fuerza a revisar la hora cada minuto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, dismissedIds, enabled, tick]);

  const dismiss = (id: string) => setDismissedIds((prev) => new Set(prev).add(id));

  return { upcoming, dismiss };
}
