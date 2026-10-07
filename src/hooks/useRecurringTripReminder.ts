import { useEffect, useMemo, useState } from 'react';
import { useRecurringTrips, type RecurringTrip } from '@/hooks/useRecurringTrips';

/** Avisa desde 30 min antes de la hora de salida hasta 15 min después, por
 *  si se abre la app un poco tarde. */
const WINDOW_BEFORE_MIN = 30;
const WINDOW_AFTER_MIN = 15;

/** Pura y testeable: ¿toca avisar de este viaje habitual ahora mismo? */
export function isTripDueNow(trip: Pick<RecurringTrip, 'active' | 'daysOfWeek' | 'departureTime'>, now: Date): boolean {
  if (!trip.active || !trip.daysOfWeek.includes(now.getDay())) return false;
  const [h, m] = trip.departureTime.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  const depMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= depMinutes - WINDOW_BEFORE_MIN && nowMinutes <= depMinutes + WINDOW_AFTER_MIN;
}

/** Cuando toca un viaje habitual (hoy es uno de sus días y la hora está
 *  cerca), lo ofrece para empezarlo con un toque — nunca arranca solo. */
export function useRecurringTripReminder(enabled: boolean) {
  const { trips } = useRecurringTrips();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [enabled]);

  const upcoming = useMemo<RecurringTrip | null>(() => {
    if (!enabled) return null;
    const now = new Date();
    for (const t of trips) {
      if (dismissedIds.has(t.id)) continue;
      if (isTripDueNow(t, now)) return t;
    }
    return null;
    // `tick` fuerza a revisar la hora cada minuto aunque trips/dismissedIds no cambien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, dismissedIds, enabled, tick]);

  const dismiss = (id: string) => setDismissedIds((prev) => new Set(prev).add(id));

  return { upcoming, dismiss };
}
