import type { Waypoint } from '@/hooks/useWaypoints';
import { fetchRealRoute } from '@/lib/mapboxDirections';

const NEIGHBOR_RANGE = 2;

async function pathDurationS(origin: { lat: number; lng: number }, list: Waypoint[]): Promise<number> {
  const route = await fetchRealRoute([origin, ...list.map((w) => ({ lat: w.lat, lng: w.lng }))]);
  return route ? route.durationS : Infinity;
}

/** Afina la posición de cada parada personal comparando el tiempo real de la
 *  ruta completa en unas pocas posiciones cercanas. Recogidas, bajadas y el
 *  destino final mantienen su orden. Si Mapbox no responde, se conserva el
 *  orden de partida. */
export async function refineErrandPositions(
  origin: { lat: number; lng: number },
  ordered: Waypoint[],
): Promise<Waypoint[]> {
  let best = ordered;
  let bestDuration = await pathDurationS(origin, best);
  const errandIds = ordered.filter((w) => w.type === 'errand').map((w) => w.id);

  for (const id of errandIds) {
    const errand = best.find((w) => w.id === id);
    if (!errand) continue;
    const without = best.filter((w) => w.id !== id);
    const finalIdx = without.findIndex((w) => w.type === 'final_destination');
    const maxPos = finalIdx === -1 ? without.length : finalIdx;
    const currentPos = best.indexOf(errand);

    for (let delta = -NEIGHBOR_RANGE; delta <= NEIGHBOR_RANGE; delta++) {
      const pos = currentPos + delta;
      if (delta === 0 || pos < 0 || pos > maxPos) continue;
      const candidate = [...without.slice(0, pos), errand, ...without.slice(pos)];
      const duration = await pathDurationS(origin, candidate);
      if (duration < bestDuration) {
        bestDuration = duration;
        best = candidate;
      }
    }
  }
  return best;
}
