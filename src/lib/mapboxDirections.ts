import { MAPBOX_TOKEN } from '@/lib/mapboxConfig';

const DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic';
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

type RouteSummary = { durationS: number; distanceM: number };
const cache = new Map<string, { value: RouteSummary; at: number }>();

/** Duración y distancia reales de conducir por una secuencia de puntos (sin
 *  geometría). Null si Mapbox no responde: quien llama decide si descarta. */
export async function fetchRealRoute(
  points: { lat: number; lng: number }[],
): Promise<RouteSummary | null> {
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const cached = cache.get(coords);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  try {
    const url = `${DIRECTIONS_BASE}/${coords}?overview=false&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;
    const value = { durationS: route.duration, distanceM: route.distance };
    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(coords, { value, at: Date.now() });
    return value;
  } catch {
    return null;
  }
}
