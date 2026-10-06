import { haversineMeters } from '@/lib/geo';
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

/** Inserta cada parada personal en la posición de línea recta que menos
 *  recorrido añade. Las recogidas y bajadas no se reordenan. */
export function insertErrandsStraight(
  origin: { lat: number; lng: number } | null,
  stopsBeforeFinal: Waypoint[],
  errands: Waypoint[],
): Waypoint[] {
  const ordered = [...stopsBeforeFinal];
  for (const errand of errands) {
    let bestPos = ordered.length;
    let bestCost = Infinity;
    for (let pos = 0; pos <= ordered.length; pos++) {
      const prev = pos === 0 ? origin : ordered[pos - 1];
      const next = ordered[pos];
      const cost =
        (prev ? straightM(prev, errand) : 0) +
        (next ? straightM(errand, next) : 0) -
        (prev && next ? straightM(prev, next) : 0);
      if (cost < bestCost) { bestCost = cost; bestPos = pos; }
    }
    ordered.splice(bestPos, 0, errand);
  }
  return ordered;
}

/** Minutos reales que añade cada parada personal: ruta completa con ella
 *  menos la misma ruta sin ella. Null para una parada si Mapbox no responde. */
export async function errandDetourMinutes(
  origin: { lat: number; lng: number },
  ordered: Waypoint[],
): Promise<Record<string, number | null>> {
  const result: Record<string, number | null> = {};
  const withAll = await pathDurationS(origin, ordered);
  for (const w of ordered.filter((x) => x.type === 'errand')) {
    const without = ordered.filter((x) => x.id !== w.id);
    const withoutDuration = await pathDurationS(origin, without);
    result[w.id] =
      Number.isFinite(withAll) && Number.isFinite(withoutDuration)
        ? Math.max(0, Math.round((withAll - withoutDuration) / 60))
        : null;
  }
  return result;
}

function straightM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversineMeters(a.lat, a.lng, b.lat, b.lng);
}
