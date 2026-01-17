import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useRouting } from '@/hooks/useRouting';

interface MapViewProps {
  children?: React.ReactNode;
  destination?: { lng: number; lat: number; name: string } | null;
  showRoute?: boolean;
  driverLocation?: { latitude: number; longitude: number } | null;
  driverLocationHistory?: [number, number][];
  showDriverMarker?: boolean;
  onCenterLocation?: () => void;
}

// Fix for default markers in Leaflet with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const MapView = ({ 
  children, 
  destination, 
  showRoute, 
  driverLocation, 
  driverLocationHistory, 
  showDriverMarker,
  onCenterLocation 
}: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const userMarker = useRef<L.Marker | null>(null);
  const destMarker = useRef<L.Marker | null>(null);
  const driverMarker = useRef<L.Marker | null>(null);
  const routeLine = useRef<L.Polyline | null>(null);
  const trailLine = useRef<L.Polyline | null>(null);
  const driverTrailLine = useRef<L.Polyline | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [positionHistory, setPositionHistory] = useState<[number, number][]>([]);
  const [mapReady, setMapReady] = useState(false);

  // Use routing hook for real driving routes
  const { route } = useRouting({
    origin: userLocation,
    destination: destination,
    enabled: showRoute ?? false,
  });

  // Center map on user location
  const centerOnUser = useCallback(() => {
    if (map.current && userLocation) {
      map.current.setView(userLocation, 16, { animate: true });
    }
  }, [userLocation]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    if (map.current) {
      map.current.zoomIn();
    }
  }, []);

  const zoomOut = useCallback(() => {
    if (map.current) {
      map.current.zoomOut();
    }
  }, []);

  // Expose center function
  useEffect(() => {
    if (onCenterLocation) {
      // This is handled via the button in Index.tsx
    }
  }, [onCenterLocation]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const initialCenter: [number, number] = [42.1401, -0.4087]; // Huesca default [lat, lng]

    map.current = L.map(mapContainer.current, {
      center: initialCenter,
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });

    // Dark OpenStreetMap tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map.current);

    // Attribution in corner that doesn't interfere
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map.current);

    setMapReady(true);

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Watch user location via browser geolocation with optimized settings
  useEffect(() => {
    if (!mapReady) return;

    // Clear any existing watch
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
        setUserLocation(coords);
        
        // Add to history (keep last 50 positions for trail)
        setPositionHistory(prev => {
          const newHistory = [...prev, coords];
          return newHistory.slice(-50);
        });
      },
      (error) => {
        console.error('Geolocation error:', error);
        // Keep last known position if available, otherwise use default
        setUserLocation(prev => prev ?? [42.1401, -0.4087]);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 2000, // Cache for 2 seconds for smoother updates
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [mapReady]);

  // Update user location marker and trail
  useEffect(() => {
    if (!map.current || !mapReady || !userLocation) return;

    // Create or update user marker
    if (!userMarker.current) {
      const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: `
          <div class="relative">
            <div class="w-5 h-5 rounded-full bg-[hsl(199,89%,48%)] border-2 border-white shadow-lg">
              <div class="absolute inset-0 rounded-full bg-[hsl(199,89%,48%)] animate-ping opacity-50"></div>
            </div>
          </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      userMarker.current = L.marker(userLocation, { icon: userIcon })
        .addTo(map.current);

      // Center map on first location
      map.current.setView(userLocation, 15, { animate: true });
    } else {
      userMarker.current.setLatLng(userLocation);
    }

    // Draw trail polyline
    if (positionHistory.length > 1) {
      if (trailLine.current) {
        trailLine.current.setLatLngs(positionHistory);
      } else {
        trailLine.current = L.polyline(positionHistory, {
          color: 'hsl(199, 89%, 48%)',
          weight: 3,
          opacity: 0.6,
          dashArray: '5, 10',
        }).addTo(map.current);
      }
    }
  }, [userLocation, positionHistory, mapReady]);

  // Handle destination marker - only show when destination is selected
  useEffect(() => {
    if (!map.current || !mapReady) return;

    // Remove existing destination marker if no destination
    if (!destination) {
      if (destMarker.current) {
        destMarker.current.remove();
        destMarker.current = null;
      }
      return;
    }

    if (!userLocation) return;

    // Remove existing destination marker
    if (destMarker.current) {
      destMarker.current.remove();
    }

    const destIcon = L.divIcon({
      className: 'destination-marker',
      html: `
        <div class="relative">
          <div class="w-8 h-8 rounded-full bg-[hsl(24,95%,53%)] flex items-center justify-center shadow-lg">
            <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    });

    destMarker.current = L.marker([destination.lat, destination.lng], { icon: destIcon })
      .addTo(map.current);

    // Fit bounds to show both points
    const bounds = L.latLngBounds([userLocation, [destination.lat, destination.lng]]);
    map.current.fitBounds(bounds, { padding: [80, 80] });
  }, [destination, userLocation, mapReady]);

  // Handle route drawing - using real driving route
  useEffect(() => {
    if (!map.current || !mapReady) return;

    // Clear existing route line immediately when not showing route
    if (!showRoute || !route) {
      if (routeLine.current) {
        routeLine.current.remove();
        routeLine.current = null;
      }
      return;
    }

    // Draw the real driving route
    if (route.coordinates.length > 0) {
      if (routeLine.current) {
        routeLine.current.setLatLngs(route.coordinates);
      } else {
        routeLine.current = L.polyline(route.coordinates, {
          color: 'hsl(199, 89%, 48%)',
          weight: 5,
          opacity: 1,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map.current);
      }
    }
  }, [route, showRoute, mapReady]);

  // Clear route and destination marker when showRoute becomes false
  useEffect(() => {
    if (!showRoute) {
      // Immediately clear route line
      if (routeLine.current && map.current) {
        routeLine.current.remove();
        routeLine.current = null;
      }
      // Clear destination marker
      if (destMarker.current && map.current) {
        destMarker.current.remove();
        destMarker.current = null;
      }
      // Center on user location
      if (map.current && userLocation) {
        map.current.setView(userLocation, 15, { animate: true });
      }
    }
  }, [showRoute, userLocation]);

  // Handle real-time driver location (for passenger view)
  useEffect(() => {
    if (!map.current || !mapReady || !showDriverMarker || !driverLocation) return;

    const driverCoords: [number, number] = [driverLocation.latitude, driverLocation.longitude];

    // Create or update driver marker
    if (!driverMarker.current) {
      const driverIcon = L.divIcon({
        className: 'driver-location-marker',
        html: `
          <div class="relative">
            <div class="w-10 h-10 rounded-full bg-[hsl(142,71%,45%)] border-3 border-white shadow-xl flex items-center justify-center">
              <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
              </svg>
              <div class="absolute inset-0 rounded-full bg-[hsl(142,71%,45%)] animate-ping opacity-30"></div>
            </div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      driverMarker.current = L.marker(driverCoords, { icon: driverIcon })
        .addTo(map.current)
        .bindPopup('Conductor en camino');
    } else {
      // Smooth animation to new position
      driverMarker.current.setLatLng(driverCoords);
    }

    // Draw driver trail if we have history
    if (driverLocationHistory && driverLocationHistory.length > 1) {
      if (driverTrailLine.current) {
        driverTrailLine.current.setLatLngs(driverLocationHistory);
      } else {
        driverTrailLine.current = L.polyline(driverLocationHistory, {
          color: 'hsl(142, 71%, 45%)',
          weight: 4,
          opacity: 0.7,
          dashArray: '8, 12',
        }).addTo(map.current);
      }
    }

    // Optionally fit bounds to include driver
    if (userLocation) {
      const bounds = L.latLngBounds([userLocation, driverCoords]);
      if (destination) {
        bounds.extend([destination.lat, destination.lng]);
      }
      map.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    }
  }, [driverLocation, driverLocationHistory, showDriverMarker, mapReady, userLocation, destination]);

  // Cleanup driver marker when not needed
  useEffect(() => {
    if (!showDriverMarker) {
      if (driverMarker.current) {
        driverMarker.current.remove();
        driverMarker.current = null;
      }
      if (driverTrailLine.current) {
        driverTrailLine.current.remove();
        driverTrailLine.current = null;
      }
    }
  }, [showDriverMarker]);

  // Expose map control functions through global methods for the parent
  useEffect(() => {
    (window as any).__mapCenterOnUser = centerOnUser;
    (window as any).__mapZoomIn = zoomIn;
    (window as any).__mapZoomOut = zoomOut;
    return () => {
      delete (window as any).__mapCenterOnUser;
      delete (window as any).__mapZoomIn;
      delete (window as any).__mapZoomOut;
    };
  }, [centerOnUser, zoomIn, zoomOut]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-background">
      {/* Map container - fully interactive */}
      <div ref={mapContainer} className="absolute inset-0 z-0" />
      
      {/* Gradient overlays - pointer-events-none ensures map remains interactive */}
      <div className="absolute inset-0 pointer-events-none z-10 bg-gradient-to-t from-background/60 via-transparent to-background/40" />
      
      {/* UI Layer - elements inside have their own pointer-events */}
      <div className="absolute inset-0 z-20">
        {children}
      </div>
    </div>
  );
};

export default MapView;
