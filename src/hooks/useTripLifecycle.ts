import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { useWaypoints } from '@/hooks/useWaypoints';
import type { SimulatedPassenger } from '@/hooks/usePassengerSimulation';

// €/km usado SOLO para calcular cuánto retener al aceptar a un pasajero —
// deliberadamente más alto que el coste/km real (~0,226€, ver
// TOTAL_COST_PER_KM en priceCalculator.ts) y sin dividir entre ocupantes,
// para que la retención cubra de sobra cualquier precio final posible.
const HOLD_RATE_PER_KM = 0.26;

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
  /** Crea (o reutiliza) la fila `trips` en cuanto el conductor se pone
   *  online, sin esperar al primer pasajero — necesario para que haya algo
   *  que descubrir desde el minuto uno. */
  ensureActiveTrip: () => Promise<string | null>;
  /** Cancela la fila `trips` de "online sin pasajeros" al apagar el modo
   *  conductor — no hace nada si ya hubo un pasajero de verdad. */
  endOnlineSession: () => void;
  /** Confirma un emparejamiento real ya aceptado por el conductor, con el
   *  trip_id de verdad — ver useRealDriverSearch. */
  confirmRealMatch: (realTripId: string) => void;
  handleMatchAccept: () => void;
  handlePickup: () => void;
  handleTripEnd: () => void;
  handleTripCancel: () => void;
  closeRating: () => void;
  /** id real de `trip_passengers` para un pasajero simulado, si llegó a
   *  persistirse — hace falta para capturar su cobro final al bajarse
   *  (SimulatedPassenger.id es solo local, la BD no lo conoce). */
  getTripPassengerDbId: (simulatedPassengerId: string) => string | null;
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
  const simToDbIdRef = useRef<Map<string, string>>(new Map());

  // ── ensureActiveTrip ────────────────────────────────────────────────────────
  // Crea la fila `trips` (si no existe ya) en cuanto el conductor se pone
  // online — no esperando al primer pasajero aceptado como antes — para que
  // haya algo que descubrir desde el minuto uno. Idempotente: si ya hay un
  // viaje activo, devuelve ese mismo id sin tocar nada.
  const ensureActiveTrip = useCallback(async (): Promise<string | null> => {
    if (activeTripId) return activeTripId;
    const { data: userData } = await supabase.auth.getUser();
    const driverId = userData?.user?.id;
    if (!driverId) return null;
    const { data, error } = await supabase
      .from('trips')
      .insert({ driver_id: driverId, status: 'active' })
      .select('id')
      .single();
    if (error || !data?.id) return null;
    setActiveTripRole('driver');
    setActiveTripId(data.id);
    return data.id;
  }, [activeTripId]);

  // ── endOnlineSession ────────────────────────────────────────────────────────
  // Al desactivar el modo conductor sin que nadie llegara a subirse, la
  // fila `trips` creada solo para que te pudieran descubrir se marca
  // cancelada — si ya hubo un pasajero de verdad, handleTripEnd/
  // handleTripCancel ya se encargan de esa fila, esto no hace nada.
  const endOnlineSession = useCallback(() => {
    if (activeTripId && !showActiveTrip) {
      supabase.from('trips').update({ status: 'cancelled' }).eq('id', activeTripId).then(() => {}, () => {});
      setActiveTripId(null);
    }
  }, [activeTripId, showActiveTrip]);

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
    // isFirstPassengerOfSession: antes se basaba en si ya existía
    // activeTripId, pero ahora la fila `trips` puede existir desde que el
    // conductor se puso online, sin ningún pasajero todavía — la señal real
    // de "primer pasajero de la sesión" es si ya se estaba mostrando el
    // viaje activo, no si ya había fila en la BD.
    const isFirstPassengerOfSession = !showActiveTrip;

    if (isDriverMode && simulatedPassenger) {
      // Un solo viaje (fila `trips`) por sesión de conducción, no uno por
      // pasajero aceptado — cada pasajero que se sube en el camino es una
      // fila en `trip_passengers`, todas apuntando al mismo trip_id.
      let newTripId: string = activeTripId ?? crypto.randomUUID();
      try {
        const { data: userData } = await supabase.auth.getUser();
        const driverId = userData?.user?.id;
        if (driverId) {
          const ensuredId = await ensureActiveTrip();
          if (ensuredId) newTripId = ensuredId;
          let tripPassengerId: string | null = null;
          if (simulatedPassenger.realRequestId) {
            // Petición real: el propio pasajero ya creó esta fila al
            // pedirlo (está en 'requested'). Aceptar es pasarla a
            // 'waiting_pickup', no insertar una segunda.
            const { error } = await supabase
              .from('trip_passengers')
              .update({ price: simulatedPassenger.compensation, status: 'waiting_pickup' })
              .eq('id', simulatedPassenger.realRequestId);
            if (!error) {
              tripPassengerId = simulatedPassenger.realRequestId;
              if (simulatedPassenger.realPassengerId) {
                supabase.functions
                  .invoke('send-push-notification', {
                    body: {
                      tripId: newTripId,
                      targetUserId: simulatedPassenger.realPassengerId,
                      title: '¡Viaje aceptado!',
                      body: 'Tu conductor viene a recogerte',
                      tag: 'request-accepted',
                    },
                  })
                  .then(() => {}, () => {});
              }
            }
          } else {
            // Simulado (o autocobro de prueba): passenger_id = el propio
            // conductor, para poder probar el ciclo de dinero real de
            // extremo a extremo sin un pasajero de verdad.
            const { data: tripPassengerRow } = await supabase
              .from('trip_passengers')
              .insert({
                trip_id: newTripId,
                passenger_id: driverId,
                passenger_name: simulatedPassenger.name,
                origin_name: simulatedPassenger.origin.name,
                origin_lat: simulatedPassenger.origin.lat,
                origin_lng: simulatedPassenger.origin.lng,
                destination_name: simulatedPassenger.destination.name,
                destination_lat: simulatedPassenger.destination.lat,
                destination_lng: simulatedPassenger.destination.lng,
                price: simulatedPassenger.compensation,
                status: 'waiting_pickup',
              })
              .select('id')
              .single();
            tripPassengerId = tripPassengerRow?.id ?? null;
          }

          // Retiene el coste bruto de sus km (recogida→destino + su desvío)
          // SIN repartir entre nadie ni restar comisión — a propósito muy
          // por encima de lo que podría llegar a pagar de verdad (que
          // siempre es, como mucho, ese mismo tramo dividido entre él y el
          // conductor, más su comisión). Así nunca se corre el riesgo de
          // tener que pedir más de lo retenido; al bajarse se captura solo
          // el importe final real y lo que sobre se libera solo.
          if (tripPassengerId) {
            simToDbIdRef.current.set(simulatedPassenger.id, tripPassengerId);
            const holdKm = simulatedPassenger.tripDistanceKm + simulatedPassenger.detourKm;
            const holdAmountCents = Math.ceil(
              (holdKm * HOLD_RATE_PER_KM + simulatedPassenger.receipt.extrasSurcharge) * 100,
            );
            supabase.functions
              .invoke('stripe-authorize-trip', {
                body: { tripPassengerId, holdAmountCents },
              })
              .then(async ({ data, error }) => {
                // supabase-js no vuelca el cuerpo JSON del error en
                // `error.message` (solo un genérico "non-2xx") — hay que
                // leerlo de la Response cruda en `error.context` para ver
                // el motivo real que puso nuestra función.
                let message = (data as { error?: string } | null)?.error;
                if (!message && error) {
                  message = error.message;
                  const ctx = (error as unknown as { context?: Response }).context;
                  try {
                    const body = await ctx?.clone().json();
                    if (body?.error) message = body.error;
                  } catch {
                    /* keep the generic message */
                  }
                }
                if (message) {
                  toast({ title: 'No se pudo retener el pago', description: message, variant: 'destructive', duration: 3500 });
                }
              }, () => {});
          }
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
      // Simulación local — no hay fila `trips` propia que crear aquí (el
      // modo pasajero real usa su propio flujo, ver useRealDriverSearch).
      setActiveTripRole('passenger');
      setActiveTripId(activeTripId ?? crypto.randomUUID());

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
    showActiveTrip,
    ensureActiveTrip,
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
    simToDbIdRef.current.clear();
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
    // Libera cualquier retención pendiente — si no, el dinero se queda
    // bloqueado en la tarjeta del pasajero hasta que Stripe lo libera solo
    // a los 7 días.
    for (const tripPassengerId of simToDbIdRef.current.values()) {
      supabase.functions.invoke('stripe-void-trip', { body: { tripPassengerId } }).then(() => {}, () => {});
    }
    setShowActiveTrip(false);
    setTripStatus('waiting');
    setActiveTripId(null);
    setMeetingPoint(null);
    simToDbIdRef.current.clear();
    cancelTrip();
    toast({ title: 'Viaje cancelado', duration: 1500 });
  }, [activeTripId, cancelTrip, toast]);

  // ── confirmRealMatch ────────────────────────────────────────────────────────
  // Pasajero real emparejado de verdad (useRealDriverSearch) — a diferencia
  // de la rama pasajero de handleMatchAccept, aquí el trip_id es el de
  // verdad (el conductor ya lo creó al ponerse online), no uno local
  // inventado — así useDriverTracking puede suscribirse a su ubicación real.
  const confirmRealMatch = useCallback(
    (realTripId: string) => {
      setActiveTripRole('passenger');
      setActiveTripId(realTripId);
      setTripStatus('waiting');
      setShowActiveTrip(true);
      toast({ title: '¡Viaje confirmado!', description: 'Tu conductor viene a recogerte.', duration: 1800 });
    },
    [toast],
  );

  // ── closeRating ─────────────────────────────────────────────────────────────
  const closeRating = useCallback(() => setShowRating(false), []);

  const getTripPassengerDbId = useCallback(
    (simulatedPassengerId: string) => simToDbIdRef.current.get(simulatedPassengerId) ?? null,
    [],
  );

  return {
    showActiveTrip,
    showRating,
    activeTripRole,
    tripStatus,
    activeTripId,
    meetingPoint,
    ensureActiveTrip,
    endOnlineSession,
    confirmRealMatch,
    handleMatchAccept,
    handlePickup,
    handleTripEnd,
    handleTripCancel,
    closeRating,
    getTripPassengerDbId,
  };
}
