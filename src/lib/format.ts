/** Formats a distance in meters as "123m" below 1km, or "1.2km" from 1km up. */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

/** Formats a duration in minutes as "45 min" below 1h, or "2h 5min" from 1h
 *  up — "122 min" en un trayecto largo no se lee de un vistazo igual de
 *  rápido que "2h 2min" conduciendo. */
export function formatDuration(minutes: number): string {
  // Redondea antes de decidir la rama — si no, 59.6 caía en "60 min" en vez
  // de pasar a "1h" (el propio redondeo de la rama corta lo empujaba justo
  // al límite que la comparación ya había descartado).
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

/** Hora de llegada estimada (reloj de pared), a partir de los minutos que
 *  quedan desde ahora — formato 24h de este proyecto, sin AM/PM. */
export function formatArrivalTime(minutesFromNow: number): string {
  const arrival = new Date(Date.now() + minutesFromNow * 60000);
  return arrival.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
