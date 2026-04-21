import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useRouting, RouteData } from '@/hooks/useRouting';
import { MAPBOX_TOKEN, MAPBOX_STYLE } from '@/lib/mapboxConfig';

mapboxgl.accessToken = MAPBOX_TOKEN;

interface MapViewProps {
  children?: React.ReactNode;
  destination?: { lng: number; lat: number; name: string } | null;
  showRoute?: boolean;
  driverLocation?: { latitude: number; longitude: number } | null;
  driverLocationHistory?: [number, number][];
  showDriverMarker?: boolean;
  onCenterLocation?: () => void;
  isNavigating?: boolean;
  waypointMarkers?: Array<{
    lat: number;
    lng: number;
    type: 'meeting_point' | 'pickup' | 'dropoff' | 'final_destination';
    name: string;
  }>;
  walkingRoute?: RouteData | null;
  onRouteUpdate?: (route: RouteData | null) => void;
  simulatedPosition?: [number, number] | null;
  simulatedHeading?: number | null;
  onUserLocationUpdate?: (loc: [number, number]) => void;
  previewWaypoints?: Array<{
    lat: number;
    lng: number;
    type: 'pickup' | 'dropoff';
    name: string;
  }>;
  intermediateRouteWaypoints?: Array<{ lat: number; lng: number }>;
}

// ── Visual constants ─────────────────────────────────────────────────────────
const ROUTE_COLOR = 'hsl(199, 89%, 48%)';
const WALKING_COLOR = 'hsl(280, 70%, 55%)';
const TRAIL_COLOR = 'hsl(199, 89%, 48%)';

const WAYPOINT_COLORS: Record<string, string> = {
  meeting_point: 'hsl(280, 70%, 55%)',
  pickup: 'hsl(24, 95%, 53%)',          // 🟧 Naranja — Parada 1 / Recogida
  dropoff: 'hsl(142, 71%, 45%)',         // 🟩 Verde — Destino pasajero (bandera)
  final_destination: 'hsl(199, 89%, 48%)',
};

const WAYPOINT_LABELS: Record<string, string> = {
  meeting_point: 'Punto de encuentro',
  pickup: 'Parada 1 — Recogida',
  dropoff: 'Destino pasajero',
  final_destination: 'Destino',
};

const WAYPOINT_ICONS: Record<string, string> = {
  meeting_point:
    '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 4.5a2.5 2.5 0 010 5 2.5 2.5 0 010-5z"/>',
  // Person icon for pickup (Parada 1)
  pickup:
    '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>',
  // Flag icon for dropoff
  dropoff: '<path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>',
  final_destination: '<path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>',
};

const buildMarkerEl = (color: string, iconPath: string, label?: string, dashed = false) => {
  const el = document.createElement('div');
  el.style.pointerEvents = 'auto';
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;${dashed ? 'opacity:0.85;' : ''}">
      <div style="
        width:34px;height:34px;border-radius:9999px;
        display:flex;align-items:center;justify-content:center;
        background:${color};
        box-shadow:0 4px 14px rgba(0,0,0,0.4);
        ${dashed ? 'border:2px dashed white;' : 'border:2px solid white;'}
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">${iconPath}</svg>
      </div>
      ${
        label
          ? `<span style="
              margin-top:4px;font-size:10px;font-weight:600;
              padding:2px 8px;border-radius:9999px;color:white;
              background:${color};white-space:nowrap;
              box-shadow:0 2px 6px rgba(0,0,0,0.3);
            ">${label}</span>`
          : ''
      }
    </div>`;
  return el;
};

const buildUserMarkerEl = (showRoute: boolean, heading: number) => {
  const el = document.createElement('div');
  el.style.pointerEvents = 'none';
  if (showRoute) {
    el.innerHTML = `
      <div style="transform: rotate(${heading}deg);">
        <div style="
          width:30px;height:30px;border-radius:9999px;
          background:${ROUTE_COLOR};border:2px solid white;
          box-shadow:0 4px 12px rgba(0,0,0,0.5);
          display:flex;align-items:center;justify-content:center;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
          </svg>
        </div>
      </div>`;
  } else {
    el.innerHTML = `
      <div style="position:relative;">
        <div style="
          width:20px;height:20px;border-radius:9999px;
          background:${ROUTE_COLOR};border:2px solid white;
          box-shadow:0 4px 12px rgba(0,0,0,0.5);
        "></div>
      </div>`;
  }
  return el;
};

const buildDriverMarkerEl = () => {
  const el = document.createElement('div');
  el.innerHTML = `
    <div style="
      width:40px;height:40px;border-radius:9999px;
      background:hsl(142,71%,45%);border:3px solid white;
      box-shadow:0 4px 14px rgba(0,0,0,0.5);
      display:flex;align-items:center;justify-content:center;
    ">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
      </svg>
    </div>`;
  return el;
};

// ── Source/layer IDs ─────────────────────────────────────────────────────────
const SRC_ROUTE = 'vm-route';
const LYR_ROUTE = 'vm-route-line';
const SRC_WALK = 'vm-walking';
const LYR_WALK = 'vm-walking-line';
const SRC_TRAIL = 'vm-trail';
const LYR_TRAIL = 'vm-trail-line';
const SRC_PREVIEW = 'vm-preview';
const LYR_PREVIEW = 'vm-preview-line';

const toLineGeoJSON = (coords: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'LineString',
    // Convert [lat, lng] -> [lng, lat] for GeoJSON
    coordinates: coords.map(([lat, lng]) => [lng, lat]),
  },
});

const MapView = ({
  children,
  destination,
  showRoute,
  driverLocation,
  driverLocationHistory,
  showDriverMarker,
  isNavigating = false,
  waypointMarkers,
  walkingRoute,
  onRouteUpdate,
  simulatedPosition,
  simulatedHeading,
  onUserLocationUpdate,
  previewWaypoints,
  intermediateRouteWaypoints,
}: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const waypointMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const previewMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const watchIdRef = useRef<number | null>(null);
  const isFollowingRef = useRef(true);

  const [rawUserLocation, setRawUserLocation] = useState<[number, number] | null>(null);
  const [userHeading, setUserHeading] = useState<number | null>(null);
  const [positionHistory, setPositionHistory] = useState<[number, number][]>([]);
  const [mapReady, setMapReady] = useState(false);

  // The marker position is driven by real GPS (rawUserLocation) by default.
  // simulatedPosition only takes over once the user explicitly starts driving
  // (the parent only passes a non-null simulatedPosition when enableNavSim).
  const markerLocation = simulatedPosition ?? rawUserLocation;
  // userLocation (used for routing/fitBounds) prefers real GPS too.
  const userLocation = rawUserLocation ?? simulatedPosition;

  useEffect(() => {
    if (rawUserLocation) onUserLocationUpdate?.(rawUserLocation);
  }, [rawUserLocation, onUserLocationUpdate]);

  // Routing — real driving routes via Mapbox Directions
  const { route } = useRouting({
    origin: userLocation,
    destination,
    intermediateWaypoints: intermediateRouteWaypoints,
    enabled: showRoute ?? false,
  });

  useEffect(() => { onRouteUpdate?.(route); }, [route, onRouteUpdate]);

  const getHeading = useCallback((): number => {
    if (simulatedHeading != null) return simulatedHeading;
    if (userHeading !== null) return userHeading;
    if (positionHistory.length >= 2) {
      const prev = positionHistory[positionHistory.length - 2];
      const curr = positionHistory[positionHistory.length - 1];
      const dLng = curr[1] - prev[1];
      const dLat = curr[0] - prev[0];
      return (Math.atan2(dLng, dLat) * 180) / Math.PI;
    }
    return 0;
  }, [simulatedHeading, userHeading, positionHistory]);

  const centerOnUser = useCallback(() => {
    if (!map.current || !userLocation) return;
    isFollowingRef.current = true;
    map.current.easeTo({
      center: [userLocation[1], userLocation[0]],
      zoom: Math.max(map.current.getZoom(), 16),
      duration: 600,
    });
  }, [userLocation]);

  const zoomIn = useCallback(() => { map.current?.zoomIn(); }, []);
  const zoomOut = useCallback(() => { map.current?.zoomOut(); }, []);

  // ── Initialize map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAPBOX_STYLE,
      center: [-0.4087, 42.1401],
      zoom: 13,
      attributionControl: false,
      pitchWithRotate: false,
    });

    map.current.on('load', () => {
      setMapReady(true);
    });

    // Stop following when user manually pans
    map.current.on('dragstart', () => { isFollowingRef.current = false; });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // ── Watch user GPS ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    if (!('geolocation' in navigator)) {
      console.warn('Geolocation API not available');
      setRawUserLocation([42.1401, -0.4087]);
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        console.log('GPS position:', position.coords);
        const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
        setRawUserLocation(coords);
        if (position.coords.heading !== null && !isNaN(position.coords.heading)) {
          setUserHeading(position.coords.heading);
        }
        setPositionHistory(prev => [...prev, coords].slice(-50));
      },
      (error) => {
        console.error('Geolocation error:', error);
        if (error.code === error.PERMISSION_DENIED) {
          window.dispatchEvent(new CustomEvent('vimatch:gps-denied'));
        }
        setRawUserLocation(prev => prev ?? [42.1401, -0.4087]);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [mapReady]);

  // ── User marker + auto-follow during navigation ───────────────────────────
  useEffect(() => {
    console.log('[marker effect] markerLocation=', markerLocation, 'rawUserLocation=', rawUserLocation, 'simulatedPosition=', simulatedPosition, 'mapReady=', mapReady);
    if (!map.current || !markerLocation) return;

    const tryMount = () => {
      if (!map.current) return;
      const m = map.current;
      const heading = getHeading();
      const el = buildUserMarkerEl(!!showRoute, heading);

      if (!userMarkerRef.current) {
        userMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([markerLocation[1], markerLocation[0]])
          .addTo(m);
        m.easeTo({ center: [markerLocation[1], markerLocation[0]], zoom: 15, duration: 600 });
      } else {
        userMarkerRef.current.setLngLat([markerLocation[1], markerLocation[0]]);
        const cur = userMarkerRef.current.getElement();
        cur.innerHTML = el.innerHTML;
      }

      if (isNavigating && isFollowingRef.current) {
        m.easeTo({
          center: [markerLocation[1], markerLocation[0]],
          bearing: simulatedHeading ?? heading ?? 0,
          pitch: 45,
          zoom: Math.max(m.getZoom(), 16),
          duration: 500,
        });
      }
    };

    if (mapReady) {
      tryMount();
    } else {
      // Map not ready yet — retry shortly so the marker doesn't get stuck waiting.
      const id = setTimeout(tryMount, 500);
      return () => clearTimeout(id);
    }
  }, [rawUserLocation, simulatedPosition, markerLocation, mapReady, showRoute, isNavigating, simulatedHeading, getHeading]);

  // ── Trail line during navigation ──────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;

    if (showRoute && positionHistory.length > 1) {
      const data = toLineGeoJSON(positionHistory);
      const src = m.getSource(SRC_TRAIL) as mapboxgl.GeoJSONSource | undefined;
      if (src) {
        src.setData(data);
      } else {
        m.addSource(SRC_TRAIL, { type: 'geojson', data });
        m.addLayer({
          id: LYR_TRAIL,
          type: 'line',
          source: SRC_TRAIL,
          paint: {
            'line-color': TRAIL_COLOR,
            'line-width': 3,
            'line-opacity': 0.4,
            'line-dasharray': [2, 3],
          },
        });
      }
    } else {
      if (m.getLayer(LYR_TRAIL)) m.removeLayer(LYR_TRAIL);
      if (m.getSource(SRC_TRAIL)) m.removeSource(SRC_TRAIL);
    }
  }, [positionHistory, mapReady, showRoute]);

  // ── Destination marker ────────────────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;

    if (!destination) {
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
      return;
    }

    const el = buildMarkerEl(WAYPOINT_COLORS.final_destination, WAYPOINT_ICONS.final_destination);
    if (destMarkerRef.current) {
      destMarkerRef.current
        .setLngLat([destination.lng, destination.lat])
        .getElement().innerHTML = el.innerHTML;
    } else {
      destMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([destination.lng, destination.lat])
        .addTo(m);
    }

    if (!showRoute && userLocation) {
      const bounds = new mapboxgl.LngLatBounds()
        .extend([userLocation[1], userLocation[0]])
        .extend([destination.lng, destination.lat]);
      m.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 600 });
    }
  }, [destination, userLocation, mapReady, showRoute]);

  // ── Driving route line (real Mapbox geometry, on road) ────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;

    // Only clear the route layer when navigation stops; never wipe it just
    // because the route is momentarily recalculating (e.g. preview waypoints
    // appearing). Require >2 points so we never draw a degenerate straight line.
    if (!showRoute) {
      if (m.getLayer(LYR_ROUTE)) m.removeLayer(LYR_ROUTE);
      if (m.getSource(SRC_ROUTE)) m.removeSource(SRC_ROUTE);
      return;
    }
    if (!route || route.coordinates.length <= 2) {
      // Keep any previously-drawn route in place; do not redraw with too few points.
      return;
    }

    const data = toLineGeoJSON(route.coordinates);
    const src = m.getSource(SRC_ROUTE) as mapboxgl.GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
    } else {
      m.addSource(SRC_ROUTE, { type: 'geojson', data });
      m.addLayer({
        id: LYR_ROUTE,
        type: 'line',
        source: SRC_ROUTE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ROUTE_COLOR,
          'line-width': 6,
          'line-opacity': 0.95,
        },
      });
    }
  }, [route, showRoute, mapReady]);

  // ── Walking route (passenger → meeting point) ─────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;

    if (!walkingRoute || walkingRoute.coordinates.length === 0) {
      if (m.getLayer(LYR_WALK)) m.removeLayer(LYR_WALK);
      if (m.getSource(SRC_WALK)) m.removeSource(SRC_WALK);
      return;
    }

    const data = toLineGeoJSON(walkingRoute.coordinates);
    const src = m.getSource(SRC_WALK) as mapboxgl.GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
    } else {
      m.addSource(SRC_WALK, { type: 'geojson', data });
      m.addLayer({
        id: LYR_WALK,
        type: 'line',
        source: SRC_WALK,
        paint: {
          'line-color': WALKING_COLOR,
          'line-width': 4,
          'line-opacity': 0.9,
          'line-dasharray': [1, 2],
        },
      });
    }
  }, [walkingRoute, mapReady]);

  // ── Waypoint markers (active trip) ────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;

    waypointMarkersRef.current.forEach(mk => mk.remove());
    waypointMarkersRef.current = [];

    if (!waypointMarkers?.length) return;

    for (const wp of waypointMarkers) {
      const color = WAYPOINT_COLORS[wp.type] || ROUTE_COLOR;
      const iconPath = WAYPOINT_ICONS[wp.type] || WAYPOINT_ICONS.pickup;
      const label = WAYPOINT_LABELS[wp.type] || wp.name;
      const el = buildMarkerEl(color, iconPath, label);
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([wp.lng, wp.lat])
        .addTo(m);
      waypointMarkersRef.current.push(marker);
    }

    // Auto-fit map to show user + first pickup/meeting point waypoint
    const pickupWp = waypointMarkers.find(
      w => w.type === 'pickup' || w.type === 'meeting_point',
    );
    if (pickupWp && userLocation) {
      const bounds = new mapboxgl.LngLatBounds()
        .extend([userLocation[1], userLocation[0]])
        .extend([pickupWp.lng, pickupWp.lat]);
      m.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 800 });
      isFollowingRef.current = false;
    }
  }, [waypointMarkers, mapReady, userLocation]);

  // ── Preview waypoints (before accepting match) ────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;

    previewMarkersRef.current.forEach(mk => mk.remove());
    previewMarkersRef.current = [];
    if (m.getLayer(LYR_PREVIEW)) m.removeLayer(LYR_PREVIEW);
    if (m.getSource(SRC_PREVIEW)) m.removeSource(SRC_PREVIEW);

    if (!previewWaypoints?.length) return;

    const points: [number, number][] = [];
    for (const wp of previewWaypoints) {
      const color = WAYPOINT_COLORS[wp.type] || ROUTE_COLOR;
      const iconPath = WAYPOINT_ICONS[wp.type] || WAYPOINT_ICONS.pickup;
      const label = WAYPOINT_LABELS[wp.type] || wp.name;
      const el = buildMarkerEl(color, iconPath, label, true);
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([wp.lng, wp.lat])
        .addTo(m);
      previewMarkersRef.current.push(marker);
      points.push([wp.lat, wp.lng]);
    }

    if (points.length >= 2) {
      m.addSource(SRC_PREVIEW, { type: 'geojson', data: toLineGeoJSON(points) });
      m.addLayer({
        id: LYR_PREVIEW,
        type: 'line',
        source: SRC_PREVIEW,
        paint: {
          'line-color': 'hsl(24, 95%, 53%)',
          'line-width': 4,
          'line-opacity': 0.6,
          'line-dasharray': [2, 2],
        },
      });
    }

    if (userLocation) {
      const bounds = new mapboxgl.LngLatBounds().extend([userLocation[1], userLocation[0]]);
      points.forEach(([lat, lng]) => bounds.extend([lng, lat]));
      m.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 });
    }
  }, [previewWaypoints, mapReady, userLocation]);

  // ── Driver marker (passenger view) ────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;

    if (!showDriverMarker || !driverLocation) {
      driverMarkerRef.current?.remove();
      driverMarkerRef.current = null;
      return;
    }

    const lngLat: [number, number] = [driverLocation.longitude, driverLocation.latitude];
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new mapboxgl.Marker({ element: buildDriverMarkerEl(), anchor: 'center' })
        .setLngLat(lngLat)
        .setPopup(new mapboxgl.Popup({ offset: 24 }).setText('Conductor en camino'))
        .addTo(m);
    } else {
      driverMarkerRef.current.setLngLat(lngLat);
    }

    if (userLocation) {
      const bounds = new mapboxgl.LngLatBounds()
        .extend([userLocation[1], userLocation[0]])
        .extend(lngLat);
      if (destination) bounds.extend([destination.lng, destination.lat]);
      m.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 600 });
    }
  }, [driverLocation, driverLocationHistory, showDriverMarker, mapReady, userLocation, destination]);

  // ── Expose map controls to window for the bottom-bar zoom buttons ─────────
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
      {/* Map canvas — fully interactive */}
      <div ref={mapContainer} className="absolute inset-0 z-0" />
      {/* Decorative gradient — non-interactive */}
      <div className="absolute inset-0 pointer-events-none z-10 bg-gradient-to-t from-background/60 via-transparent to-background/40" />
      {/* Children (overlays) — wrapper non-interactive; children opt-in via pointer-events-auto */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        {children}
      </div>
    </div>
  );
};

export default MapView;
