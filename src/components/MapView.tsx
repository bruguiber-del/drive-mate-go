import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/integrations/supabase/client';

interface MapViewProps {
  children?: React.ReactNode;
  destination?: { lng: number; lat: number; name: string } | null;
  showRoute?: boolean;
}

// Fix for default markers in Leaflet with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const MapView = ({ children, destination, showRoute }: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const userMarker = useRef<L.Marker | null>(null);
  const destMarker = useRef<L.Marker | null>(null);
  const routeLine = useRef<L.Polyline | null>(null);
  const trailLine = useRef<L.Polyline | null>(null);

  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [positionHistory, setPositionHistory] = useState<[number, number][]>([]);
  const [mapReady, setMapReady] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const initialCenter: [number, number] = [42.1401, -0.4087]; // Huesca default [lat, lng]

    map.current = L.map(mapContainer.current, {
      center: initialCenter,
      zoom: 14,
      zoomControl: false,
    });

    // Dark OpenStreetMap tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map.current);

    // Add zoom control to bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);

    setMapReady(true);

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Watch user location via browser geolocation
  useEffect(() => {
    if (!mapReady) return;

    const watchId = navigator.geolocation.watchPosition(
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
        // Use default location if geolocation fails
        setUserLocation([42.1401, -0.4087]);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 2000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
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

  // Handle destination marker and route
  useEffect(() => {
    if (!map.current || !mapReady || !destination || !userLocation) return;

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

    // Draw route line if enabled
    if (showRoute) {
      if (routeLine.current) {
        routeLine.current.remove();
      }
      
      routeLine.current = L.polyline([userLocation, [destination.lat, destination.lng]], {
        color: 'hsl(199, 89%, 48%)',
        weight: 4,
        opacity: 1,
      }).addTo(map.current);
    }

    // Fit bounds to show both points
    const bounds = L.latLngBounds([userLocation, [destination.lat, destination.lng]]);
    map.current.fitBounds(bounds, { padding: [80, 80] });
  }, [destination, userLocation, mapReady, showRoute]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-background">
      <div ref={mapContainer} className="absolute inset-0" />
      
      {/* Gradient overlays */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-background/60 via-transparent to-background/40" />
      
      {/* UI Layer */}
      {children}
    </div>
  );
};

export default MapView;
