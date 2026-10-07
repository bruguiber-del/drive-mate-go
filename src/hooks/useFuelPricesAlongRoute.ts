import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface FuelPricesAlongRoute {
  gasoline95: number | null;
  dieselA: number | null;
  stationCount: number;
  updatedAt: string | null;
}

interface UseFuelPricesAlongRouteOptions {
  enabled: boolean;
  /** [lat, lng] de la ruta actual — se usa solo para calcular la zona a
   *  consultar, no se manda punto por punto. */
  routeCoordinates: [number, number][] | null;
  /** Cada cuánto refrescar — 5 min por defecto, lo mismo que tarda el
   *  Ministerio en renovar sus propios datos (no tiene sentido pedir más a menudo). */
  refreshMs?: number;
}

// Margen alrededor de la ruta para no perder gasolineras justo al lado del
// trazado — 0.05° son unos 5,5km.
const ROUTE_PADDING_DEG = 0.05;

function computeBoundingBox(coords: [number, number][]) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return {
    minLat: minLat - ROUTE_PADDING_DEG,
    maxLat: maxLat + ROUTE_PADDING_DEG,
    minLng: minLng - ROUTE_PADDING_DEG,
    maxLng: maxLng + ROUTE_PADDING_DEG,
  };
}

/**
 * Precio medio real de gasolina y diésel entre las gasolineras oficiales
 * (Ministerio para la Transición Ecológica) dentro de la ruta actual —
 * antes el coste de combustible era siempre un valor fijo desactualizado.
 * Se apoya en la función `fuel-prices-along-route` porque el navegador no
 * puede llamar directamente a la API del Ministerio (sin CORS).
 */
export function useFuelPricesAlongRoute({
  enabled,
  routeCoordinates,
  refreshMs = 5 * 60 * 1000,
}: UseFuelPricesAlongRouteOptions) {
  const [prices, setPrices] = useState<FuelPricesAlongRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const coordsRef = useRef(routeCoordinates);
  coordsRef.current = routeCoordinates;

  const fetchPrices = useCallback(async () => {
    const coords = coordsRef.current;
    if (!coords || coords.length < 2) return;
    setLoading(true);
    try {
      const box = computeBoundingBox(coords);
      const { data, error } = await supabase.functions.invoke('fuel-prices-along-route', { body: box });
      if (!error && data && !data.error && !data.unavailable) {
        setPrices({
          gasoline95: data.gasoline95 ?? null,
          dieselA: data.dieselA ?? null,
          stationCount: data.stationCount ?? 0,
          updatedAt: data.updatedAt ?? null,
        });
      }
    } catch {
      // Se mantiene el último precio real conocido; si nunca hubo ninguno,
      // el resto del cálculo cae solo al valor genérico fijo.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !routeCoordinates || routeCoordinates.length < 2) return;
    fetchPrices();
    const interval = setInterval(fetchPrices, refreshMs);
    return () => clearInterval(interval);
    // Se refresca cada refreshMs, no en cada recálculo menor de la ruta —
    // solo importa si hay ruta o no, no sus coordenadas exactas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, !!routeCoordinates, refreshMs, fetchPrices]);

  return { prices, loading, refetch: fetchPrices };
}
