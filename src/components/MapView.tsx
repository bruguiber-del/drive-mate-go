import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useRouting, RouteData } from '@/hooks/useRouting';

interface MapViewProps {
  children?: React.ReactNode;
  destination?: { lng: number; lat: number; name: string } | null;
  showRoute?: boolean;
  driverLocation?: { latitude: number; longitude: number } | null;
  driverLocationHistory?: [number, number][];
  showDriverMarker?: boolean;
  onCenterLocation?: () => void;
  isNavigating?: boolean;
  /** Additional waypoint markers to show on the map */
  waypointMarkers?: Array<{
    lat: number;
    lng: number;
    type: 'meeting_point' | 'pickup' | 'dropoff' | 'final_destination';
    name: string;
  }>;
  /** Walking route for passenger view */
  walkingRoute?: RouteData | null;
  /** Callback to expose route data to parent */
  onRouteUpdate?: (route: RouteData | null) => void;
  /** Override user position with simulated position */
  simulatedPosition?: [number, number] | null;
  /** Override heading with simulated heading */
  simulatedHeading?: number | null;
  /** Expose real user location to parent */
  onUserLocationUpdate?: (loc: [number, number]) => void;
  /** Preview route (before accepting) — separate from main route */
  previewWaypoints?: Array<{
    lat: number;
    lng: number;
    type: 'pickup' | 'dropoff';
    name: string;
  }>;
}

// Fix for default markers in Leaflet with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Waypoint marker colors by type
const WAYPOINT_COLORS: Record<string, string> = {
  meeting_point: 'hsl(280, 70%, 55%)',  // Purple
  pickup: 'hsl(142, 71%, 45%)',          // Green
  dropoff: 'hsl(24, 95%, 53%)',          // Orange
  final_destination: 'hsl(199, 89%, 48%)', // Blue
};

const WAYPOINT_ICONS: Record<string, string> = {
  meeting_point: '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 4.5a2.5 2.5 0 010 5 2.5 2.5 0 010-5z"/>',
  pickup: '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>',
  dropoff: '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>',
  final_destination: '<path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>',
};

const MapView = ({ 
  children, 
  destination, 
  showRoute, 
  driverLocation, 
  driverLocationHistory, 
  showDriverMarker,
  onCenterLocation,
  isNavigating = false,
  waypointMarkers,
  walkingRoute,
  onRouteUpdate,
  simulatedPosition,
  simulatedHeading,
  onUserLocationUpdate,
  previewWaypoints,
}: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const userMarker = useRef<L.Marker | null>(null);
  const destMarker = useRef<L.Marker | null>(null);
  const driverMarker = useRef<L.Marker | null>(null);
  const routeLine = useRef<L.Polyline | null>(null);
  const walkingLine = useRef<L.Polyline | null>(null);
  const trailLine = useRef<L.Polyline | null>(null);
  const driverTrailLine = useRef<L.Polyline | null>(null);
  const waypointMarkersRef = useRef<L.Marker[]>([]);
  const previewMarkersRef = useRef<L.Marker[]>([]);
  const previewLineRef = useRef<L.Polyline | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const isFollowingRef = useRef(true);

  const [rawUserLocation, setRawUserLocation] = useState<[number, number] | null>(null);
  const [userHeading, setUserHeading] = useState<number | null>(null);
  const [positionHistory, setPositionHistory] = useState<[number, number][]>([]);
  const [mapReady, setMapReady] = useState(false);

  // Effective position: simulated overrides real
  const userLocation = simulatedPosition ?? rawUserLocation;

  // Expose real location to parent
  useEffect(() => {
    if (rawUserLocation) onUserLocationUpdate?.(rawUserLocation);
  }, [rawUserLocation, onUserLocationUpdate]);

  // Use routing hook for real driving routes
  const { route } = useRouting({
    origin: userLocation,
    destination: destination,
    enabled: showRoute ?? false,
  });

  // Expose route data to parent
  useEffect(() => {
    onRouteUpdate?.(route);
  }, [route, onRouteUpdate]);

  // Calculate heading from position history or GPS heading
  const getHeading = useCallback((): number => {
    if (userHeading !== null) return userHeading;
    if (positionHistory.length >= 2) {
      const prev = positionHistory[positionHistory.length - 2];
      const curr = positionHistory[positionHistory.length - 1];
      const dLng = curr[1] - prev[1];
      const dLat = curr[0] - prev[0];
      return (Math.atan2(dLng, dLat) * 180) / Math.PI;
    }
    return 0;
  }, [userHeading, positionHistory]);

  // Center map on user location with navigation offset
  const centerOnUser = useCallback(() => {
    if (!map.current || !userLocation) return;
    isFollowingRef.current = true;

    if (showRoute) {
      // Navigation mode: position user in lower third, rotated to heading
      const heading = getHeading();
      const zoom = map.current.getZoom() || 17;
      
      // Calculate offset point: shift center ahead of user in travel direction
      const offsetPx = map.current.getSize().y * 0.25; // 25% of screen height
      const headingRad = (heading * Math.PI) / 180;
      const point = map.current.project(userLocation, zoom);
      // Move center ahead (negative because we want user below center)
      point.x -= Math.sin(headingRad) * offsetPx;
      point.y += Math.cos(headingRad) * offsetPx;
      const offsetLatLng = map.current.unproject(point, zoom);

      map.current.setView(offsetLatLng, Math.max(zoom, 16), { animate: true, duration: 0.5 });
    } else {
      map.current.setView(userLocation, 16, { animate: true });
    }
  }, [userLocation, showRoute, getHeading]);

  // Zoom controls
  const zoomIn = useCallback(() => { map.current?.zoomIn(); }, []);
  const zoomOut = useCallback(() => { map.current?.zoomOut(); }, []);

  // Stop following when user manually pans
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;
    const onDragStart = () => { isFollowingRef.current = false; };
    m.on('dragstart', onDragStart);
    return () => { m.off('dragstart', onDragStart); };
  }, [mapReady]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const initialCenter: [number, number] = [42.1401, -0.4087];

    map.current = L.map(mapContainer.current, {
      center: initialCenter,
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map.current);

    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map.current);
    setMapReady(true);

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Watch user location
  useEffect(() => {
    if (!mapReady) return;

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
        setUserLocation(coords);
        
        if (position.coords.heading !== null && !isNaN(position.coords.heading)) {
          setUserHeading(position.coords.heading);
        }
        
        setPositionHistory(prev => [...prev, coords].slice(-50));
      },
      (error) => {
        console.error('Geolocation error:', error);
        setUserLocation(prev => prev ?? [42.1401, -0.4087]);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 2000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [mapReady]);

  // Update user marker + navigation camera follow
  useEffect(() => {
    if (!map.current || !mapReady || !userLocation) return;

    const rotation = getHeading();

    // Navigation mode: directional arrow icon
    const markerHtml = showRoute 
      ? `<div style="transform: rotate(${rotation}deg);">
          <div class="w-7 h-7 rounded-full bg-primary border-2 border-white shadow-lg flex items-center justify-center" style="background: hsl(199,89%,48%);">
            <svg class="w-4 h-4" fill="white" viewBox="0 0 24 24">
              <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
            </svg>
          </div>
        </div>`
      : `<div class="relative">
          <div class="w-5 h-5 rounded-full border-2 border-white shadow-lg" style="background: hsl(199,89%,48%);">
            <div class="absolute inset-0 rounded-full animate-ping opacity-50" style="background: hsl(199,89%,48%);"></div>
          </div>
        </div>`;

    const userIcon = L.divIcon({
      className: 'user-location-marker',
      html: markerHtml,
      iconSize: showRoute ? [28, 28] : [20, 20],
      iconAnchor: showRoute ? [14, 14] : [10, 10],
    });

    if (!userMarker.current) {
      userMarker.current = L.marker(userLocation, { icon: userIcon }).addTo(map.current);
      map.current.setView(userLocation, 15, { animate: true });
    } else {
      userMarker.current.setLatLng(userLocation);
      userMarker.current.setIcon(userIcon);
    }

    // Auto-follow in navigation mode
    if (showRoute && isFollowingRef.current) {
      const heading = getHeading();
      const zoom = map.current.getZoom() || 17;
      const offsetPx = map.current.getSize().y * 0.25;
      const headingRad = (heading * Math.PI) / 180;
      const point = map.current.project(userLocation, zoom);
      point.x -= Math.sin(headingRad) * offsetPx;
      point.y += Math.cos(headingRad) * offsetPx;
      const offsetLatLng = map.current.unproject(point, zoom);
      map.current.setView(offsetLatLng, Math.max(zoom, 16), { animate: true, duration: 0.8 });
    }

    // Trail line during navigation
    if (showRoute && positionHistory.length > 1) {
      if (trailLine.current) {
        trailLine.current.setLatLngs(positionHistory);
      } else {
        trailLine.current = L.polyline(positionHistory, {
          color: 'hsl(199, 89%, 48%)',
          weight: 3,
          opacity: 0.4,
          dashArray: '5, 10',
        }).addTo(map.current);
      }
    } else if (!showRoute && trailLine.current) {
      trailLine.current.remove();
      trailLine.current = null;
    }
  }, [userLocation, userHeading, positionHistory, mapReady, showRoute, getHeading]);

  // Destination marker
  useEffect(() => {
    if (!map.current || !mapReady) return;

    if (!destination) {
      if (destMarker.current) { destMarker.current.remove(); destMarker.current = null; }
      return;
    }
    if (!userLocation) return;

    if (destMarker.current) destMarker.current.remove();

    const destIcon = L.divIcon({
      className: 'destination-marker',
      html: `<div class="w-8 h-8 rounded-full flex items-center justify-center shadow-lg" style="background: hsl(24,95%,53%);">
        <svg class="w-4 h-4" fill="white" viewBox="0 0 24 24">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    });

    destMarker.current = L.marker([destination.lat, destination.lng], { icon: destIcon })
      .addTo(map.current);

    if (!showRoute) {
      const bounds = L.latLngBounds([userLocation, [destination.lat, destination.lng]]);
      map.current.fitBounds(bounds, { padding: [80, 80] });
    }
  }, [destination, userLocation, mapReady, showRoute]);

  // Route drawing
  useEffect(() => {
    if (!map.current || !mapReady) return;

    if (!showRoute || !route) {
      if (routeLine.current) { routeLine.current.remove(); routeLine.current = null; }
      return;
    }

    if (route.coordinates.length > 0) {
      if (routeLine.current) {
        routeLine.current.setLatLngs(route.coordinates);
      } else {
        routeLine.current = L.polyline(route.coordinates, {
          color: 'hsl(199, 89%, 48%)',
          weight: 6,
          opacity: 1,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map.current);
      }
    }
  }, [route, showRoute, mapReady]);

  // Walking route drawing (dashed, different color)
  useEffect(() => {
    if (!map.current || !mapReady) return;

    if (!walkingRoute) {
      if (walkingLine.current) { walkingLine.current.remove(); walkingLine.current = null; }
      return;
    }

    if (walkingRoute.coordinates.length > 0) {
      if (walkingLine.current) {
        walkingLine.current.setLatLngs(walkingRoute.coordinates);
      } else {
        walkingLine.current = L.polyline(walkingRoute.coordinates, {
          color: 'hsl(280, 70%, 55%)',
          weight: 4,
          opacity: 0.9,
          dashArray: '8, 12',
          lineCap: 'round',
        }).addTo(map.current);
      }
    }
  }, [walkingRoute, mapReady]);

  // Waypoint markers (meeting point, pickup, dropoff, etc.)
  useEffect(() => {
    if (!map.current || !mapReady) return;

    // Clear existing waypoint markers
    waypointMarkersRef.current.forEach(m => m.remove());
    waypointMarkersRef.current = [];

    if (!waypointMarkers?.length) return;

    for (const wp of waypointMarkers) {
      const color = WAYPOINT_COLORS[wp.type] || 'hsl(199,89%,48%)';
      const iconPath = WAYPOINT_ICONS[wp.type] || WAYPOINT_ICONS.pickup;

      const icon = L.divIcon({
        className: 'waypoint-marker',
        html: `<div class="flex flex-col items-center">
          <div class="w-8 h-8 rounded-full flex items-center justify-center shadow-lg" style="background: ${color};">
            <svg class="w-4 h-4" fill="white" viewBox="0 0 24 24">${iconPath}</svg>
          </div>
          <span class="text-[10px] font-medium mt-0.5 px-1.5 py-0.5 rounded-full shadow" style="background: ${color}; color: white; white-space: nowrap;">${wp.name}</span>
        </div>`,
        iconSize: [80, 48],
        iconAnchor: [40, 8],
      });

      const marker = L.marker([wp.lat, wp.lng], { icon }).addTo(map.current);
      waypointMarkersRef.current.push(marker);
    }
  }, [waypointMarkers, mapReady]);

  // Clear route and destination when showRoute becomes false
  useEffect(() => {
    if (!showRoute) {
      if (routeLine.current && map.current) { routeLine.current.remove(); routeLine.current = null; }
      if (destMarker.current && map.current) { destMarker.current.remove(); destMarker.current = null; }
      if (walkingLine.current && map.current) { walkingLine.current.remove(); walkingLine.current = null; }
      if (map.current && userLocation) {
        isFollowingRef.current = true;
        map.current.setView(userLocation, 15, { animate: true });
      }
    }
  }, [showRoute, userLocation]);

  // Driver location (passenger view)
  useEffect(() => {
    if (!map.current || !mapReady || !showDriverMarker || !driverLocation) return;

    const driverCoords: [number, number] = [driverLocation.latitude, driverLocation.longitude];

    if (!driverMarker.current) {
      const driverIcon = L.divIcon({
        className: 'driver-location-marker',
        html: `<div class="relative">
          <div class="w-10 h-10 rounded-full border-3 border-white shadow-xl flex items-center justify-center" style="background: hsl(142,71%,45%);">
            <svg class="w-5 h-5" fill="white" viewBox="0 0 24 24">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
            </svg>
            <div class="absolute inset-0 rounded-full animate-ping opacity-30" style="background: hsl(142,71%,45%);"></div>
          </div>
        </div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      driverMarker.current = L.marker(driverCoords, { icon: driverIcon })
        .addTo(map.current)
        .bindPopup('Conductor en camino');
    } else {
      driverMarker.current.setLatLng(driverCoords);
    }

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

    if (userLocation) {
      const bounds = L.latLngBounds([userLocation, driverCoords]);
      if (destination) bounds.extend([destination.lat, destination.lng]);
      map.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    }
  }, [driverLocation, driverLocationHistory, showDriverMarker, mapReady, userLocation, destination]);

  // Cleanup driver marker
  useEffect(() => {
    if (!showDriverMarker) {
      if (driverMarker.current) { driverMarker.current.remove(); driverMarker.current = null; }
      if (driverTrailLine.current) { driverTrailLine.current.remove(); driverTrailLine.current = null; }
    }
  }, [showDriverMarker]);

  // Expose map controls
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
      <div ref={mapContainer} className="absolute inset-0 z-0" />
      <div className="absolute inset-0 pointer-events-none z-10 bg-gradient-to-t from-background/60 via-transparent to-background/40" />
      <div className="absolute inset-0 z-20 pointer-events-none">
        {children}
      </div>
    </div>
  );
};

export default MapView;
