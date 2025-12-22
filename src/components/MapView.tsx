import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapbox } from '@/hooks/useMapbox';
import MapboxTokenInput from './MapboxTokenInput';

interface MapViewProps {
  children?: React.ReactNode;
  destination?: { lng: number; lat: number; name: string } | null;
  showRoute?: boolean;
}

const MapView = ({ children, destination, showRoute }: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const userMarker = useRef<mapboxgl.Marker | null>(null);
  const destMarker = useRef<mapboxgl.Marker | null>(null);
  
  const { 
    token, 
    isTokenValid, 
    isLoading, 
    validateToken, 
    userLocation,
    watchUserLocation 
  } = useMapbox();

  const [mapLoaded, setMapLoaded] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !isTokenValid || !token) return;
    if (map.current) return;

    mapboxgl.accessToken = token;

    const initialCenter: [number, number] = userLocation || [-0.4087, 42.1401]; // Huesca default

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: initialCenter,
      zoom: 14,
      pitch: 45,
      bearing: 0,
    });

    map.current.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      'bottom-right'
    );

    map.current.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      'bottom-right'
    );

    map.current.on('load', () => {
      setMapLoaded(true);
      
      // Add 3D buildings
      const layers = map.current?.getStyle()?.layers;
      if (layers) {
        const labelLayerId = layers.find(
          (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
        )?.id;

        map.current?.addLayer(
          {
            id: '3d-buildings',
            source: 'composite',
            'source-layer': 'building',
            filter: ['==', 'extrude', 'true'],
            type: 'fill-extrusion',
            minzoom: 12,
            paint: {
              'fill-extrusion-color': '#1a1a2e',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'min_height'],
              'fill-extrusion-opacity': 0.8,
            },
          },
          labelLayerId
        );
      }
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [isTokenValid, token]);

  // Update user location marker
  useEffect(() => {
    if (!map.current || !mapLoaded || !userLocation) return;

    if (!userMarker.current) {
      const el = document.createElement('div');
      el.className = 'user-location-marker';
      el.innerHTML = `
        <div class="w-5 h-5 rounded-full bg-primary border-2 border-white shadow-lg animate-pulse">
          <div class="absolute inset-0 rounded-full bg-primary animate-ping opacity-50"></div>
        </div>
      `;

      userMarker.current = new mapboxgl.Marker({ element: el })
        .setLngLat(userLocation)
        .addTo(map.current);
    } else {
      userMarker.current.setLngLat(userLocation);
    }

    map.current.flyTo({
      center: userLocation,
      zoom: 15,
      duration: 1500,
    });
  }, [userLocation, mapLoaded]);

  // Watch user location
  useEffect(() => {
    if (isTokenValid) {
      const cleanup = watchUserLocation();
      return cleanup;
    }
  }, [isTokenValid, watchUserLocation]);

  // Handle destination and route
  useEffect(() => {
    if (!map.current || !mapLoaded || !destination || !userLocation) return;

    // Add destination marker
    if (destMarker.current) {
      destMarker.current.remove();
    }

    const destEl = document.createElement('div');
    destEl.innerHTML = `
      <div class="relative">
        <div class="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shadow-lg">
          <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </div>
        <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-secondary rotate-45"></div>
      </div>
    `;

    destMarker.current = new mapboxgl.Marker({ element: destEl, anchor: 'bottom' })
      .setLngLat([destination.lng, destination.lat])
      .addTo(map.current);

    // Draw route if enabled
    if (showRoute) {
      drawRoute(userLocation, [destination.lng, destination.lat]);
    }

    // Fit bounds to show both points
    const bounds = new mapboxgl.LngLatBounds()
      .extend(userLocation)
      .extend([destination.lng, destination.lat]);

    map.current.fitBounds(bounds, {
      padding: { top: 150, bottom: 250, left: 50, right: 50 },
      duration: 1500,
    });
  }, [destination, userLocation, mapLoaded, showRoute]);

  const drawRoute = async (origin: [number, number], dest: [number, number]) => {
    if (!map.current || !token) return;

    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${origin[0]},${origin[1]};${dest[0]},${dest[1]}?geometries=geojson&access_token=${token}`
      );
      const data = await response.json();

      if (data.routes && data.routes[0]) {
        const route = data.routes[0].geometry;

        // Remove existing route layer
        if (map.current.getSource('route')) {
          map.current.removeLayer('route-glow');
          map.current.removeLayer('route');
          map.current.removeSource('route');
        }

        // Add route source
        map.current.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: route,
          },
        });

        // Add glow layer
        map.current.addLayer({
          id: 'route-glow',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': 'hsl(199, 89%, 48%)',
            'line-width': 12,
            'line-blur': 8,
            'line-opacity': 0.4,
          },
        });

        // Add main route layer
        map.current.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': 'hsl(199, 89%, 48%)',
            'line-width': 5,
            'line-opacity': 1,
          },
        });
      }
    } catch (error) {
      console.error('Error drawing route:', error);
    }
  };

  // Show token input if not valid
  if (!isTokenValid) {
    return (
      <div className="relative w-full h-full overflow-hidden bg-background">
        <MapboxTokenInput
          onValidToken={validateToken}
          isLoading={isLoading}
        />
      </div>
    );
  }

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
