import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { useWaypoints } from '@/hooks/useWaypoints';
import type { SimulatedPassenger } from '@/hooks/usePassengerSimulation';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TripRole = 'driver' | 'passenger';
export type TripStatus = 'waiting' | 'picked_up' | 'in_progress';

interface MeetingPoint {
  lat: number;
  lng: number;
  name: string;
}

interface UseTripLifecycleOptions {
  /** Whether the app is currently in driver mode */
  isDriverMode: boolean;
  /** The simulated passenger returned by usePassengerSimulation */
  simulatedPassenger: SimulatedPassenger | null;
  /** Called after a passenger is accepted / dismissed */
  dismissSimPassenger: () => void;
  /** Waypoint helpers forwarded from useWaypoints */
  waypointControls: Pick<
    ReturnType<typeof useWaypoints>,
    | 'addPassengerWaypoints'
    | 'addMeetingPointWaypoints'
    | 'confirmMeetingPointArrival'
    | 'confirmPickup'
    | 'completeTrip'
    | 'cancelTrip'
    | 'currentLeg'
  >;
}

interface UseTripLifecycleReturn {
  // State
  showActiveTrip: boolean;
  showRating: boolean;
  activeTripRole: TripRole;
  tripStatus: TripStatus;
  activeTripId: string | null;
  meetingPoint: MeetingPoint | null;

  // Actions
  handleMatchAccept: () => void;
  handlePickup: () => void;
  handleTripEnd: () => void;
  handleTripCancel: () => void;
  closeRating: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTripLifecycle({
  isDriverMode,
  simulatedPassenger,
  dismissSimPassenger,
  waypointControls,
}: UseTripLifecycleOptions): UseTripLifecycleReturn {
  const { toast } = useToast();

  const {
    addPassengerWaypoints,
    addMeetingPointWaypoints,
    confirmMeetingPointArrival,
    confirmPickup,
    completeTrip,
    cancelTrip,
    currentLeg,
  } = waypointControls;

  // ── Trip state ──────────────────────────────────────────────────────────────
  const [showActiveTrip, setShowActiveTrip] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [activeTripRole, setActiveTripRole] = useState<TripRole>('passenger');
  const [tripStatus, setTripStatus] = useState<TripStatus>('waiting');
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [meetingPoint, setMeetingPoint] = useState<MeetingPoint | null>(null);

  // ── handleMatchAccept ───────────────────────────────────────────────────────
  /**
   * Single entry-point for both driver and passenger match acceptance.
   *
   * Fixes from previous audit:
   *  1. No longer calls handlePassengerAcceptDriver internally — eliminates the
   *     opaque double-call and the duplicate crypto.randomUUID() race condition.
   *  2. The `else` branch is now genuinely reachable: passenger mode has its own
   *     complete state setup rather than delegating to another function.
   *  3. A single UUID is created once and used by whichever branch runs.
   *  4. setTripStatus / setShowActiveTrip are called in both branches — nothing
   *     can silently fall through without activating the trip view.
   */
  const handleMatchAccept = useCallback(async () => {
    let newTripId: string = activeTripId ?? crypto.randomUUID();
    // Si ya había un viaje activo, este es el 2º/3º pasajero de la misma
    // sesión — antes se repetía el mismo "¡Viaje aceptado!" en cada uno, y
    // si se aceptaban varios seguidos rápido, el aviso se sustituía a sí
    // mismo antes de llegar a cerrarse solo, dando la sensación de que
    // nunca desaparecía.
    const isFirstPassengerOfSession = !activeTripId;

    if (isDriverMode && simulatedPassenger) {
      // Un solo viaje (fila `trips`) por sesión de conducción, no uno por
      // pasajero aceptado — cada pasajero que se sube en el camino es una
      // fila en `trip_passengers`, todas apuntando al mismo trip_id.
      try {
        const { data: userData } = await supabase.auth.getUser();
        const driverId = userData?.user?.id;
        if (driverId) {
          if (!activeTripId) {
            const { data, error } = await supabase
              .from('trips')
              .insert({ driver_id: driverId, status: 'active' })
              .select('id')
              .single();
            if (!error && data?.id) newTripId = data.id;
          }
          await supabase.from('trip_passengers').insert({
            trip_id: newTripId,
            passenger_name: simulatedPassenger.name,
            origin_name: simulatedPassenger.origin.name,
            origin_lat: simulatedPassenger.origin.lat,
            origin_lng: simulatedPassenger.origin.lng,
            destination_name: simulatedPassenger.destination.name,
            destination_lat: simulatedPassenger.destination.lat,
            destination_lng: simulatedPassenger.destination.lng,
            price: simulatedPassenger.compensation,
            status: 'waiting_pickup',
          });
        }
      } catch {
        /* keep the local UUID if the trip could not be persisted */
      }


      // ── Driver branch ────────────────────────────────────────────────────
      setActiveTripRole('driver');
      setActiveTripId(newTripId);

      const pickup = {

        lat: simulatedPassenger.origin.lat,
        lng: simulatedPassenger.origin.lng,
        name: simulatedPassenger.origin.name,
      };
      const dropoff = {
        lat: simulatedPassenger.destination.lat,
        lng: simulatedPassenger.destination.lng,
        name: simulatedPassenger.destination.name,
      };

      if (!simulatedPassenger.doorToDoor) {
        // Without door-to-door, the passenger walks to the driver. The pickup
        // point IS the passenger's origin (a real address) — never compute a
        // mathematical midpoint, which can land in the middle of a field.
        const mp: MeetingPoint = {
          lat: pickup.lat,
          lng: pickup.lng,
          name: `Recogida — ${pickup.name}`,
        };

        setMeetingPoint(mp);
        addMeetingPointWaypoints(mp, dropoff);
        toast(
          isFirstPassengerOfSession
            ? { title: '¡Viaje aceptado!', description: 'Dirígete al punto de recogida.', duration: 1800 }
            : { title: 'Nuevo pasajero añadido', description: simulatedPassenger.name, duration: 1800 },
        );
      } else {
        addPassengerWaypoints(pickup, dropoff);
        toast(
          isFirstPassengerOfSession
            ? { title: '¡Viaje aceptado!', description: 'Dirígete a recoger al pasajero.', duration: 1800 }
            : { title: 'Nuevo pasajero añadido', description: simulatedPassenger.name, duration: 1800 },
        );
      }

      dismissSimPassenger();
    } else {
      // ── Passenger branch ─────────────────────────────────────────────────
      setActiveTripRole('passenger');
      setActiveTripId(newTripId);

      // El punto de recogida es siempre tu ubicación real — nunca uno
      // inventado. Antes, con "puerta a puerta" desactivado, se desplazaba
      // +0.001° en diagonal (~150m) sin relación con ninguna calle real;
      // quien lo lee en el mapa (Index) ya usa tu posición real cuando no
      // hay un punto de encuentro explícito aquí.
      toast({
        title: '¡Viaje confirmado!',
        description: 'Tu conductor viene a recogerte.',
        duration: 1800,
      });
    }

    // Common to both branches — guaranteed to run
    setTripStatus('waiting');
    setShowActiveTrip(true);
  }, [
    isDriverMode,
    simulatedPassenger,
    dismissSimPassenger,
    addPassengerWaypoints,
    addMeetingPointWaypoints,
    toast,
    activeTripId,
  ]);

  // ── handlePickup ────────────────────────────────────────────────────────────
  const handlePickup = useCallback(() => {
    // "Pasajero recogido" tiene sentido para el conductor (ha recogido a
    // otra persona) pero no para el propio pasajero, que es quien acaba de
    // subir — antes salía el mismo aviso para los dos. Se usa el rol real
    // del viaje en curso, no el interruptor de modo, por si cambiase
    // mientras el viaje sigue activo.
    const isDriver = activeTripRole === 'driver';
    const title = isDriver ? '¡Pasajero recogido!' : '¡Ya vas en camino!';
    if (currentLeg === 'to_meeting_point') {
      confirmMeetingPointArrival();
      toast({ title, description: isDriver ? 'Continuando hacia bajada del pasajero' : 'Continuando hacia tu destino', duration: 1800 });
    } else {
      confirmPickup();
      toast({ title, description: 'Continuando hacia el destino', duration: 1800 });
    }
    setTripStatus('picked_up');
  }, [currentLeg, confirmMeetingPointArrival, confirmPickup, toast, activeTripRole]);

  // ── handleTripEnd ───────────────────────────────────────────────────────────
  const handleTripEnd = useCallback(() => {
    if (activeTripId) {
      // Antes la fila de `trips` se quedaba para siempre en status 'active'
      // — nada la marcaba como terminada.
      supabase
        .from('trips')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', activeTripId)
        .then(() => {}, () => {});
    }
    setShowActiveTrip(false);
    setTripStatus('waiting');
    setActiveTripId(null);
    setMeetingPoint(null);
    completeTrip();
    setShowRating(true);
  }, [completeTrip, activeTripId]);

  // ── handleTripCancel ────────────────────────────────────────────────────────
  // Distinto de handleTripEnd: esto es "nunca llegó a pasar", no "terminó
  // bien" — el viaje se marca 'cancelled' (no 'completed') y no se pide
  // valoración, porque no hay nada que valorar.
  const handleTripCancel = useCallback(() => {
    if (activeTripId) {
      supabase
        .from('trips')
        .update({ status: 'cancelled' })
        .eq('id', activeTripId)
        .then(() => {}, () => {});
    }
    setShowActiveTrip(false);
    setTripStatus('waiting');
    setActiveTripId(null);
    setMeetingPoint(null);
    cancelTrip();
    toast({ title: 'Viaje cancelado', duration: 1500 });
  }, [activeTripId, cancelTrip, toast]);

  // ── closeRating ─────────────────────────────────────────────────────────────
  const closeRating = useCallback(() => setShowRating(false), []);

  return {
    showActiveTrip,
    showRating,
    activeTripRole,
    tripStatus,
    activeTripId,
    meetingPoint,
    handleMatchAccept,
    handlePickup,
    handleTripEnd,
    handleTripCancel,
    closeRating,
  };
}
