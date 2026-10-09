import { useEffect, useRef, useState } from 'react';
import { destinationPoint } from '@/lib/geo';
import { computeBearing } from '@/lib/mapGeo';

export interface SimulatedDriverPosition {
  latitude: number;
  longitude: number;
  heading?: number;
}

const TICK_MS = 1000;

/**
 * Anima una posición de conductor ficticia moviéndose en línea recta desde
 * un punto inventado a `distanceMeters` del punto de recogida (en una
 * dirección aleatoria) hasta el propio punto de recogida, a lo largo de
 * `etaMinutes` — para que el pasajero vea "por dónde va" un conductor
 * simulado aunque no haya ningún dispositivo real emitiendo su GPS (antes
 * el mapa del pasajero no mostraba ni la ruta ni la posición del conductor
 * porque esos dos props dependían solo del tracking real por Supabase).
 */
export function useSimulatedDriverPosition({
  enabled,
  driverId,
  pickupPoint,
  distanceMeters,
  etaMinutes,
}: {
  enabled: boolean;
  driverId: string | null;
  pickupPoint: { lat: number; lng: number } | null;
  distanceMeters: number;
  etaMinutes: number;
}): SimulatedDriverPosition | null {
  const [position, setPosition] = useState<SimulatedDriverPosition | null>(null);
  const startRef = useRef<{ lat: number; lng: number } | null>(null);
  const startTimeRef = useRef(0);
  const driverIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !pickupPoint || !driverId) {
      setPosition(null);
      startRef.current = null;
      driverIdRef.current = null;
      return;
    }

    // Un conductor nuevo arranca desde un punto de partida nuevo; el mismo
    // conductor con el punto de recogida reajustado por GPS (jitter) sigue
    // su trayecto sin reiniciar el avance ya hecho.
    if (driverIdRef.current !== driverId) {
      driverIdRef.current = driverId;
      const bearing = Math.random() * 360;
      startRef.current = destinationPoint(pickupPoint.lat, pickupPoint.lng, bearing, distanceMeters / 1000);
      startTimeRef.current = Date.now();
    }

    const durationMs = Math.max(etaMinutes, 1) * 60_000;

    const tick = () => {
      const start = startRef.current;
      if (!start) return;
      const progress = Math.min(1, (Date.now() - startTimeRef.current) / durationMs);
      const lat = start.lat + (pickupPoint.lat - start.lat) * progress;
      const lng = start.lng + (pickupPoint.lng - start.lng) * progress;
      const heading = progress < 1 ? computeBearing([lat, lng], pickupPoint) : undefined;
      setPosition({ latitude: lat, longitude: lng, heading });
    };

    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [enabled, driverId, pickupPoint?.lat, pickupPoint?.lng, distanceMeters, etaMinutes]);

  return position;
}
