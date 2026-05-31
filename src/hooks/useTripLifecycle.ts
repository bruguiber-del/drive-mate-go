import { useState, useCallback } from 'react';
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
  /** Real user location [lat, lng] — used to compute meeting point midpoint */
  realUserLocation: [number, number] | null;
  /** Passenger door-to-door preference set in PassengerSettingsSheet */
  isDoorToDoor: boolean;
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
  closeRating: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTripLifecycle({
  isDriverMode,
  simulatedPassenger,
  realUserLocation,
  isDoorToDoor,
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
  const handleMatchAccept = useCallback(() => {
    const newTripId = crypto.randomUUID();

    if (isDriverMode && simulatedPassenger) {
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
        toast({ title: '¡Viaje aceptado!', description: 'Dirígete al punto de recogida.' });
      } else {
        addPassengerWaypoints(pickup, dropoff);
        toast({ title: '¡Viaje aceptado!', description: 'Dirígete a recoger al pasajero.' });
      }

      dismissSimPassenger();
    } else {
      // ── Passenger branch ─────────────────────────────────────────────────
      setActiveTripRole('passenger');
      setActiveTripId(newTripId);

      if (!isDoorToDoor && realUserLocation) {
        // Meeting point ~150m from passenger's real location
        const mp: MeetingPoint = {
          lat: realUserLocation[0] + 0.001,
          lng: realUserLocation[1] + 0.001,
          name: 'Punto de encuentro',
        };
        setMeetingPoint(mp);
        toast({
          title: '¡Viaje confirmado!',
          description: 'Camina al punto de encuentro cercano.',
        });
      } else if (!isDoorToDoor && !realUserLocation) {
        toast({
          title: '¡Viaje confirmado!',
          description: 'Esperando tu ubicación GPS...',
        });
      } else {
        toast({
          title: '¡Viaje confirmado!',
          description: 'Tu conductor viene a recogerte.',
        });
      }
    }

    // Common to both branches — guaranteed to run
    setTripStatus('waiting');
    setShowActiveTrip(true);
  }, [
    isDriverMode,
    simulatedPassenger,
    realUserLocation,
    isDoorToDoor,
    dismissSimPassenger,
    addPassengerWaypoints,
    addMeetingPointWaypoints,
    toast,
  ]);

  // ── handlePickup ────────────────────────────────────────────────────────────
  const handlePickup = useCallback(() => {
    if (currentLeg === 'to_meeting_point') {
      confirmMeetingPointArrival();
      toast({ title: '¡Pasajero recogido!', description: 'Continuando hacia bajada del pasajero' });
    } else {
      confirmPickup();
      toast({ title: '¡Pasajero recogido!', description: 'Continuando hacia el destino' });
    }
    setTripStatus('picked_up');
  }, [currentLeg, confirmMeetingPointArrival, confirmPickup, toast]);

  // ── handleTripEnd ───────────────────────────────────────────────────────────
  const handleTripEnd = useCallback(() => {
    setShowActiveTrip(false);
    setTripStatus('waiting');
    setActiveTripId(null);
    setMeetingPoint(null);
    completeTrip();
    setShowRating(true);
  }, [completeTrip]);

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
    closeRating,
  };
}
