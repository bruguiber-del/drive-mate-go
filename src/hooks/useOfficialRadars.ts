import { useCallback, useEffect, useRef, useState } from 'react';
import { approxMetersBetween } from '@/lib/mapGeo';

export interface OfficialRadar {
  id: string;
  lat: number;
  lng: number;
  maxspeedKmh: number | null;
}

/**
 * Overpass es un servicio público y gratuito de consultas sobre el mapa de
 * OpenStreetMap — aquí se usa para traer los radares fijos YA mapeados por
 * la comunidad (`highway=speed_camera`), sin que ningún usuario de la app
 * tenga que reportarlos primero. Varios espejos por si el principal está
 * saturado (pasa a menudo con el servidor oficial) — se prueban en orden,
 * el primero que responda vale.
 */
const OVERPASS_MIRRORS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const OVERPASS_TIMEOUT_MS = 10_000;

/** Radio (m) de la zona que se consulta alrededor de la posición actual. */
const FETCH_RADIUS_M = 8_000;

/** No merece la pena volver a preguntar a Overpass por cada metro que te
 *  mueves — solo cuando te has alejado bastante del centro de la última
 *  consulta, ni hace falta ni sería justo para un servicio gratuito. */
const REFETCH_THRESHOLD_M = 3_000;

/** Tope de tiempo entre dos consultas, aunque te muevas mucho más rápido
 *  que eso — para no abusar de un servicio público y gratuito. */
const MIN_MS_BETWEEN_FETCHES = 20_000;

function metersToDegreesLat(m: number): number {
  return m / 111_320;
}

function metersToDegreesLng(m: number, atLat: number): number {
  return m / (111_320 * Math.cos((atLat * Math.PI) / 180));
}

interface OverpassNode {
  id: number;
  lat: number;
  lon: number;
  tags?: { maxspeed?: string };
}

interface OverpassResponse {
  elements?: OverpassNode[];
}

async function fetchFromMirror(url: string, bbox: string, signal: AbortSignal): Promise<OverpassResponse> {
  const body = `data=${encodeURIComponent(`[out:json][timeout:20];node["highway"="speed_camera"](${bbox});out body;`)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal,
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  return res.json();
}

async function fetchOfficialRadars(center: [number, number]): Promise<OfficialRadar[]> {
  const [lat, lng] = center;
  const dLat = metersToDegreesLat(FETCH_RADIUS_M);
  const dLng = metersToDegreesLng(FETCH_RADIUS_M, lat);
  const bbox = `${lat - dLat},${lng - dLng},${lat + dLat},${lng + dLng}`;

  for (const url of OVERPASS_MIRRORS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
    try {
      const data = await fetchFromMirror(url, bbox, controller.signal);
      clearTimeout(timeoutId);
      const elements = data?.elements ?? [];
      return elements.map((el) => ({
        id: `osm-${el.id}`,
        lat: el.lat,
        lng: el.lon,
        maxspeedKmh: el.tags?.maxspeed ? Number(el.tags.maxspeed) || null : null,
      }));
    } catch {
      clearTimeout(timeoutId);
      // Se prueba el siguiente espejo — si fallan todos, se mantiene lo que
      // ya hubiera de una consulta anterior (ver abajo), no es un error que
      // deba interrumpir la navegación.
    }
  }
  return [];
}

/**
 * Radares fijos "de base" — ya existentes en la carretera según
 * OpenStreetMap, visibles sin que ningún usuario de la app tenga que
 * reportarlos. Complementan (no sustituyen) los avisos que sí reporta la
 * gente desde la propia app para radares nuevos, policía, obras...
 */
export function useOfficialRadars(enabled: boolean, center: [number, number] | null) {
  const [radars, setRadars] = useState<OfficialRadar[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const lastFetchCenterRef = useRef<[number, number] | null>(null);
  const lastFetchAtRef = useRef(0);
  const fetchingRef = useRef(false);

  const maybeFetch = useCallback(async (c: [number, number]) => {
    if (fetchingRef.current) return;
    const now = Date.now();
    if (now - lastFetchAtRef.current < MIN_MS_BETWEEN_FETCHES) return;
    if (lastFetchCenterRef.current && approxMetersBetween(lastFetchCenterRef.current, c) < REFETCH_THRESHOLD_M) {
      return;
    }
    fetchingRef.current = true;
    lastFetchCenterRef.current = c;
    lastFetchAtRef.current = now;
    try {
      const found = await fetchOfficialRadars(c);
      if (found.length) {
        // Se ACUMULA en vez de reemplazar: al moverte, los radares ya
        // vistos no deben desaparecer del mapa solo porque ahora queden
        // fuera del radio de la última consulta.
        const fresh = found.filter((r) => !seenIdsRef.current.has(r.id));
        if (fresh.length) {
          fresh.forEach((r) => seenIdsRef.current.add(r.id));
          setRadars((prev) => [...prev, ...fresh]);
        }
      }
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !center) return;
    maybeFetch(center);
  }, [enabled, center, maybeFetch]);

  // Al desactivarse (fin de la navegación) se limpia todo — si se vuelve a
  // navegar, mejor pedir datos frescos que arrastrar los de un viaje
  // anterior que pudo quedar lejos de la zona nueva.
  useEffect(() => {
    if (!enabled) {
      seenIdsRef.current = new Set();
      lastFetchCenterRef.current = null;
      setRadars([]);
    }
  }, [enabled]);

  return radars;
}
