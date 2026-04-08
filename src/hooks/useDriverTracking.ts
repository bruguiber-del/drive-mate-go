import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DriverLocation {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  createdAt?: Date;
}

interface UseDriverTrackingOptions {
  tripId: string | null;
  isDriver: boolean;
  enabled: boolean;
}

// Hook for driver to broadcast their location
export function useDriverBroadcast({ tripId, enabled }: { tripId: string | null; enabled: boolean }) {
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLocationRef = useRef<GeolocationPosition | null>(null);

  const broadcastLocation = useCallback(async (position: GeolocationPosition) => {
    if (!tripId) return;

    lastLocationRef.current = position;

    try {
      // Use any to bypass type checking since table was just created
      await (supabase.from('driver_locations') as any).insert({
        trip_id: tripId,
        driver_id: 'demo-driver', // In production, use auth.uid()
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        heading: position.coords.heading,
        speed: position.coords.speed,
        accuracy: position.coords.accuracy,
      });
    } catch (error) {
      console.error('Error broadcasting location:', error);
    }
  }, [tripId]);

  useEffect(() => {
    if (!enabled || !tripId) {
      // Cleanup
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Watch position for real-time updates
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        lastLocationRef.current = position;
      },
      (error) => console.error('Geolocation error:', error),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 2000,
      }
    );

    // Broadcast every 5 seconds (optimal for real-time tracking without excessive DB writes)
    intervalRef.current = setInterval(() => {
      if (lastLocationRef.current) {
        broadcastLocation(lastLocationRef.current);
      }
    }, 5000);

    // Initial broadcast
    navigator.geolocation.getCurrentPosition(
      broadcastLocation,
      (error) => console.error('Initial location error:', error),
      { enableHighAccuracy: true }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, tripId, broadcastLocation]);
}

// Hook for passenger to receive driver location updates
export function useDriverLocationSubscription({ tripId, enabled }: { tripId: string | null; enabled: boolean }) {
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [locationHistory, setLocationHistory] = useState<[number, number][]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch initial location history
  useEffect(() => {
    if (!enabled || !tripId) {
      setDriverLocation(null);
      setLocationHistory([]);
      return;
    }

    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        // Use any to bypass type checking since table was just created
        const { data, error } = await (supabase
          .from('driver_locations') as any)
          .select('latitude, longitude, heading, speed, created_at')
          .eq('trip_id', tripId)
          .order('created_at', { ascending: false })
          .limit(30);

        if (error) throw error;

        if (data && data.length > 0) {
          // Set current location
          setDriverLocation({
            latitude: data[0].latitude,
            longitude: data[0].longitude,
            heading: data[0].heading ?? undefined,
            speed: data[0].speed ?? undefined,
            createdAt: new Date(data[0].created_at),
          });

          // Set history (reversed for chronological order)
          setLocationHistory(
            data.reverse().map((loc) => [loc.latitude, loc.longitude] as [number, number])
          );
        }
      } catch (error) {
        console.error('Error fetching location history:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [enabled, tripId]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!enabled || !tripId) return;

    const channel = supabase
      .channel(`driver-location-${tripId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'driver_locations',
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          const newLocation = payload.new as {
            latitude: number;
            longitude: number;
            heading: number | null;
            speed: number | null;
            created_at: string;
          };

          setDriverLocation({
            latitude: newLocation.latitude,
            longitude: newLocation.longitude,
            heading: newLocation.heading ?? undefined,
            speed: newLocation.speed ?? undefined,
            createdAt: new Date(newLocation.created_at),
          });

          // Add to history (keep last 30 positions)
          setLocationHistory((prev) => {
            const newHistory = [...prev, [newLocation.latitude, newLocation.longitude] as [number, number]];
            return newHistory.slice(-30);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, tripId]);

  return { driverLocation, locationHistory, isLoading };
}

// Combined hook for tracking
export function useDriverTracking({ tripId, isDriver, enabled }: UseDriverTrackingOptions) {
  // If driver, broadcast location
  useDriverBroadcast({ tripId, enabled: enabled && isDriver });

  // If passenger, subscribe to updates
  const { driverLocation, locationHistory, isLoading } = useDriverLocationSubscription({
    tripId,
    enabled: enabled && !isDriver,
  });

  return {
    driverLocation: isDriver ? null : driverLocation,
    locationHistory: isDriver ? [] : locationHistory,
    isLoading,
  };
}
