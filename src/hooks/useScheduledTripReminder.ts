import { useEffect, useMemo, useState } from 'react';
import type { ScheduledTrip } from '@/hooks/useScheduledTrips';

/** Mismo margen que los viajes habituales: avisa desde 30 min antes hasta
 *  15 min después, por si se abre la app un poco tarde. */
const WINDOW_BEFORE_MIN = 30;
const WINDOW_AFTER_MIN = 15;

/** Pura y testeable: ¿toca avisar de este viaje puntual ahora mismo? */
export function isScheduledTripDueNow(trip: Pick<ScheduledTrip, 'scheduledAt'>, now: Date): boolean {
  const diffMin = (new Date(trip.scheduledAt).getTime() - now.getTime()) / 60_000;
  return diffMin <= WINDOW_BEFORE_MIN && diffMin >= -WINDOW_AFTER_MIN;
}

/** Pura y testeable: ¿ya ha llegado (o pasado) la hora exacta programada?
 *  Mismo criterio que hasTripStarted para los habituales — antes de la
 *  hora se pregunta, a partir de ella se arranca solo. */
export function hasScheduledTripStarted(trip: Pick<ScheduledTrip, 'scheduledAt'>, now: Date): boolean {
  return new Date(trip.scheduledAt).getTime() <= now.getTime();
}

/** Igual que los viajes habituales pero para una fecha y hora concretas —
 *  lo ofrece con un toque antes de la hora, y lo arranca solo en cuanto
 *  llega la hora exacta (ver hasScheduledTripStarted).
 *
 *  `trips` se recibe de fuera (ver el mismo comentario en
 *  useRecurringTripReminder) para compartir la misma lista que usa
 *  RecurringTripsSheet al programar — si no, un viaje recién programado
 *  nunca llegaba a verlo esta instancia y el aviso no saltaba nunca. */
export function useScheduledTripReminder(enabled: boolean, trips: ScheduledTrip[]) {
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
