import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseDriverPresenceOptions {
  /** La fila `trips` que representa esta sesión de conducción (ya creada
   *  con ensureActiveTrip, aunque todavía no lleve ningún pasajero). */
  tripId: string | null;
  enabled: boolean;
  location: [number, number] | null;
  destination: { lat: number; lng: number; name: string } | null;
  freeSeats: number;
}

const BROADCAST_INTERVAL_MS = 6000;

/**
 * Emite la posición aproximada y el destino del conductor mientras está
 * online — es lo que un pasajero real necesita leer para poder
 * descubrirlo ANTES de que exista ningún viaje en común (driver_locations
 * se queda para el seguimiento ya emparejados, ver useDriverTracking).
 */
export function useDriverPresence({ tripId, enabled, location, destination, freeSeats }: UseDriverPresenceOptions) {
  const locationRef = useRef(location);
  useEffect(() => { locationRef.current = location; }, [location]);
  const destinationRef = useRef(destination);
  useEffect(() => { destinationRef.current = destination; }, [destination]);
  const seatsRef = useRef(freeSeats);
  useEffect(() => { seatsRef.current = freeSeats; }, [freeSeats]);

  useEffect(() => {
    if (!enabled || !tripId) return;

    const broadcast = () => {
      const loc = locationRef.current;
      if (!loc) return;
      supabase
        .from('trips')
        .update({
          driver_lat: loc[0],
          driver_lng: loc[1],
          destination_lat: destinationRef.current?.lat ?? null,
          destination_lng: destinationRef.current?.lng ?? null,
          destination_name: destinationRef.current?.name ?? null,
          free_seats: seatsRef.current,
          location_updated_at: new Date().toISOString(),
        })
        .eq('id', tripId)
        .then(() => {}, () => {});
    };

    broadcast();
    const interval = setInterval(broadcast, BROADCAST_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, tripId]);
}
