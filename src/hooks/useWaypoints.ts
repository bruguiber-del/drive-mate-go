import { useState, useCallback, useMemo } from 'react';

export interface Waypoint {
  id: string;
  type: 'pickup' | 'dropoff' | 'meeting_point' | 'final_destination';
  lat: number;
  lng: number;
  name: string;
  completed: boolean;
}

export type TripLeg = 'to_meeting_point' | 'to_pickup' | 'to_dropoff' | 'to_destination';

interface UseWaypointsOptions {
  finalDestination?: { lat: number; lng: number; name: string } | null;
}

export function useWaypoints({ finalDestination }: UseWaypointsOptions = {}) {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [currentLeg, setCurrentLeg] = useState<TripLeg>('to_destination');
  const [hasPassenger, setHasPassenger] = useState(false);

  // Add meeting point + dropoff (no door-to-door)
  const addMeetingPointWaypoints = useCallback((
    meetingPoint: { lat: number; lng: number; name: string },
    dropoff: { lat: number; lng: number; name: string }
  ) => {
    const mpWaypoint: Waypoint = {
      id: `meeting-${Date.now()}`,
      type: 'meeting_point',
      lat: meetingPoint.lat,
      lng: meetingPoint.lng,
      name: meetingPoint.name,
      completed: false,
    };
    const dropoffWaypoint: Waypoint = {
      id: `dropoff-${Date.now()}`,
      type: 'dropoff',
      lat: dropoff.lat,
      lng: dropoff.lng,
      name: dropoff.name,
      completed: false,
    };

    setWaypoints(prev => {
      const withoutFinal = prev.filter(w => w.type !== 'final_destination');
      const finalDest = prev.find(w => w.type === 'final_destination');
      return finalDest
        ? [...withoutFinal, mpWaypoint, dropoffWaypoint, finalDest]
        : [...withoutFinal, mpWaypoint, dropoffWaypoint];
    });

    setCurrentLeg('to_meeting_point');
    setHasPassenger(true);
  }, []);

  // Add pickup and dropoff points when accepting a passenger (door-to-door)
  const addPassengerWaypoints = useCallback((
    pickup: { lat: number; lng: number; name: string },
    dropoff: { lat: number; lng: number; name: string }
  ) => {
    const pickupWaypoint: Waypoint = {
      id: `pickup-${Date.now()}`,
      type: 'pickup',
      lat: pickup.lat,
      lng: pickup.lng,
      name: pickup.name,
      completed: false,
    };

    const dropoffWaypoint: Waypoint = {
      id: `dropoff-${Date.now()}`,
      type: 'dropoff',
      lat: dropoff.lat,
      lng: dropoff.lng,
      name: dropoff.name,
      completed: false,
    };

    setWaypoints(prev => {
      const withoutFinal = prev.filter(w => w.type !== 'final_destination');
      const finalDest = prev.find(w => w.type === 'final_destination');
      
      return finalDest 
        ? [...withoutFinal, pickupWaypoint, dropoffWaypoint, finalDest]
        : [...withoutFinal, pickupWaypoint, dropoffWaypoint];
    });

    setCurrentLeg('to_pickup');
    setHasPassenger(true);
  }, []);

  // Set the driver's final destination
  const setFinalDestination = useCallback((dest: { lat: number; lng: number; name: string }) => {
    const finalWaypoint: Waypoint = {
      id: `final-${Date.now()}`,
      type: 'final_destination',
      lat: dest.lat,
      lng: dest.lng,
      name: dest.name,
      completed: false,
    };

    setWaypoints(prev => {
      const withoutFinal = prev.filter(w => w.type !== 'final_destination');
      return [...withoutFinal, finalWaypoint];
    });
  }, []);

  // Confirm arrival at meeting point → advance to pickup (same spot, passenger walks)
  const confirmMeetingPointArrival = useCallback(() => {
    setWaypoints(prev =>
      prev.map(w => w.type === 'meeting_point' ? { ...w, completed: true } : w)
    );
    // Meeting point IS the pickup, so go to dropoff
    setCurrentLeg('to_dropoff');
  }, []);

  // Mark passenger as picked up → advance to dropoff leg
  const confirmPickup = useCallback(() => {
    setWaypoints(prev => 
      prev.map(w => w.type === 'pickup' ? { ...w, completed: true } : w)
    );
    setCurrentLeg('to_dropoff');
  }, []);

  // Mark passenger as dropped off → advance to final destination
  const confirmDropoff = useCallback(() => {
    setWaypoints(prev => 
      prev.map(w => w.type === 'dropoff' ? { ...w, completed: true } : w)
    );
    setCurrentLeg('to_destination');
    setHasPassenger(false);
  }, []);

  // Complete the trip
  const completeTrip = useCallback(() => {
    setWaypoints([]);
    setCurrentLeg('to_destination');
    setHasPassenger(false);
  }, []);

  // Cancel trip and clear all waypoints
  const cancelTrip = useCallback(() => {
    setWaypoints([]);
    setCurrentLeg('to_destination');
    setHasPassenger(false);
  }, []);

  // Get the current navigation target
  const currentTarget = useMemo(() => {
    const pendingWaypoints = waypoints.filter(w => !w.completed);
    
    switch (currentLeg) {
      case 'to_meeting_point':
        return pendingWaypoints.find(w => w.type === 'meeting_point') || null;
      case 'to_pickup':
        return pendingWaypoints.find(w => w.type === 'pickup') || null;
      case 'to_dropoff':
        return pendingWaypoints.find(w => w.type === 'dropoff') || null;
      case 'to_destination':
        return pendingWaypoints.find(w => w.type === 'final_destination') || null;
      default:
        return null;
    }
  }, [waypoints, currentLeg]);

  // Get all waypoints for route visualization
  const routeWaypoints = useMemo(() => {
    return waypoints.filter(w => !w.completed);
  }, [waypoints]);

  return {
    waypoints,
    currentLeg,
    currentTarget,
    routeWaypoints,
    hasPassenger,
    addPassengerWaypoints,
    setFinalDestination,
    confirmPickup,
    confirmDropoff,
    completeTrip,
    cancelTrip,
  };
}
