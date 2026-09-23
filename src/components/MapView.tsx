import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useRouting, RouteData, TravelMode } from '@/hooks/useRouting';
import { MAPBOX_TOKEN, MAPBOX_STYLE } from '@/lib/mapboxConfig';
import {
  MIN_MOVE_METERS,
  approxMetersBetween,
  cumulativeDistanceExceeds,
  computeBearing,
  markerScreenRotation,
  nextSpeedTier,
  TIER_CAMERA,
  type SpeedTier,
} from '@/lib/mapGeo';
import { ROUTE_COLOR, toLineGeoJSON, toCongestionGeoJSON, CONGESTION_COLOR_EXPR } from '@/lib/mapGeoJSON';
import {
  WAYPOINT_COLORS,
  WAYPOINT_LABELS,
  WAYPOINT_ICONS,
  buildMarkerEl,
  buildUserMarkerEl,
  buildDriverMarkerEl,
} from '@/lib/mapMarkerElements';

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
  /** Perfil de ruta a usar: coche (con tráfico), a pie o bici. Por defecto coche. */
  travelMode?: TravelMode;
  waypointMarkers?: Array<{
    lat: number;
    lng: number;
    type: 'meeting_point' | 'pickup' | 'dropoff' | 'final_destination';
    name: string;
  }>;
  walkingRoute?: RouteData | null;
  onRouteUpdate?: (route: RouteData | null) => void;
  /** Called when the Directions request fails, with the error message (or null once it recovers). */
  onRouteError?: (error: string | null) => void;
  /** Called with true while a Directions request is in flight, false once it settles. */
  onRouteLoadingChange?: (loading: boolean) => void;
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
const WALKING_COLOR = 'hsl(280, 70%, 55%)';
const TRAIL_COLOR = 'hsl(199, 89%, 48%)';

// ── Source/layer IDs ─────────────────────────────────────────────────────────
const SRC_ROUTE = 'vm-route';
const LYR_ROUTE = 'vm-route-line';
const SRC_WALK = 'vm-walking';
const LYR_WALK = 'vm-walking-line';
const SRC_TRAIL = 'vm-trail';
const LYR_TRAIL = 'vm-trail-line';
const SRC_PREVIEW = 'vm-preview';
const LYR_PREVIEW = 'vm-preview-line';

const MapView = ({
  children,
  destination,
  showRoute,
  driverLocation,
  driverLocationHistory,
  showDriverMarker,
  isNavigating = false,
  travelMode = 'driving',
  waypointMarkers,
  walkingRoute,
  onRouteUpdate,
  onRouteError,
  onRouteLoadingChange,
  simulatedPosition,
  simulatedHeading,
  onUserLocationUpdate,
  previewWaypoints,
  intermediateRouteWaypoints,
}: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const waypointMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const previewMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const updateMarkerLabelVisibility = useCallback(() => {
    if (!map.current) return;

    const markers = [...waypointMarkersRef.current, ...previewMarkersRef.current];
    const positioned = markers.map(marker => ({
      marker,
      point: map.current?.project(marker.getLngLat()),
      label: marker.getElement().querySelector<HTMLElement>('[data-marker-label]'),
    }));

    positioned.forEach(({ label }) => {
      if (label) label.style.display = '';
    });

    const COLLISION_DISTANCE_PX = 72;
    for (let i = 0; i < positioned.length; i += 1) {
      const first = positioned[i];
      if (!first.point || !first.label) continue;
      for (let j = i + 1; j < positioned.length; j += 1) {
        const second = positioned[j];
        if (!second.point || !second.label) continue;
        if (first.point.dist(second.point) < COLLISION_DISTANCE_PX) {
          first.label.style.display = 'none';
          second.label.style.display = 'none';
        }
      }
    }
  }, []);

  const watchIdRef = useRef<number | null>(null);
  const isFollowingRef = useRef(true);
  // Timer to resume following after a fitBounds shows user + waypoints together.
  const resumeFollowTimerRef = useRef<number | null>(null);
  const lastPropagatedRef = useRef<[number, number] | null>(null);

  const [rawUserLocation, setRawUserLocation] = useState<[number, number] | null>(null);
  const [userHeading, setUserHeading] = useState<number | null>(null);
  const [positionHistory, setPositionHistory] = useState<[number, number][]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [speedTier, setSpeedTier] = useState<SpeedTier>('city');
  // Se incrementa para forzar un reintento del dibujado de la ruta cuando el
  // estilo no estaba listo la primera vez (ver el efecto de la línea de ruta).
  const [styleRetryTick, setStyleRetryTick] = useState(0);

  // The marker position is driven by real GPS (rawUserLocation) by default.
  // simulatedPosition only takes over once the user explicitly starts driving
  // (the parent only passes a non-null simulatedPosition when enableNavSim).
  const markerLocation = simulatedPosition ?? rawUserLocation;
  // userLocation (used for routing/fitBounds) prefers real GPS too.
  const userLocation = rawUserLocation ?? simulatedPosition;

  // Latest location without forcing effects to depend on every GPS tick.
  const userLocationRef = useRef<[number, number] | null>(null);
  userLocationRef.current = userLocation;

  useEffect(() => {
    if (rawUserLocation) onUserLocationUpdate?.(rawUserLocation);
  }, [rawUserLocation, onUserLocationUpdate]);

  // Routing — rutas reales vía Mapbox Directions, en el perfil elegido
  const { route, error: routeError, isLoading: isRouteLoading } = useRouting({
    origin: userLocation,
    destination,
    intermediateWaypoints: intermediateRouteWaypoints,
    enabled: showRoute ?? false,
    profile: travelMode,
  });

  useEffect(() => { onRouteUpdate?.(route); }, [route, onRouteUpdate]);
  useEffect(() => { onRouteError?.(routeError); }, [routeError, onRouteError]);
  useEffect(() => { onRouteLoadingChange?.(isRouteLoading); }, [isRouteLoading, onRouteLoadingChange]);

  /** ¿Hay movimiento real suficiente para fiarse del rumbo del GPS? (~30 m) */
  const hasReliableMovement = useMemo(() => {
    if (positionHistory.length < 3) return false;
    return cumulativeDistanceExceeds(positionHistory, 30);
  }, [positionHistory]);

  /** Rumbo inicial (great-circle) en línea recta hacia el próximo destino. */
  const bearingToTarget = useMemo(() => {
    const from = userLocationRef.current;
    const target = waypointMarkers?.[0] ?? destination;
    if (!from || !target) return null;
    return computeBearing(from, target);
    // rawUserLocation fuerza el recálculo al moverse el usuario
  }, [waypointMarkers, destination, rawUserLocation]);

  const getHeading = useCallback((): number => {
    if (simulatedHeading != null) return simulatedHeading;

    // Con ruta activa hacia un destino: orienta SIEMPRE hacia él,
    // haya movimiento o no — la app muestra la línea recta al destino.
    if (showRoute && bearingToTarget !== null) return bearingToTarget;

    // Sin ruta/destino activo: manda el rumbo real del GPS.
    if (hasReliableMovement) {
      if (userHeading !== null) return userHeading;
      const prev = positionHistory[positionHistory.length - 2];
      const curr = positionHistory[positionHistory.length - 1];
      const dLng = curr[1] - prev[1];
      const dLat = curr[0] - prev[0];
      return (Math.atan2(dLng, dLat) * 180) / Math.PI;
    }

    if (userHeading !== null) return userHeading;
    if (positionHistory.length >= 2) {
      const prev = positionHistory[positionHistory.length - 2];
      const curr = positionHistory[positionHistory.length - 1];
      const dLng = curr[1] - prev[1];
      const dLat = curr[0] - prev[0];
      return (Math.atan2(dLng, dLat) * 180) / Math.PI;
    }
    return 0;
  }, [simulatedHeading, userHeading, positionHistory, hasReliableMovement, bearingToTarget, showRoute]);

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

    let savedPos: [number, number] | null = null;
    try {
      savedPos = JSON.parse(localStorage.getItem('vimatch_last_pos') || 'null');
    } catch { savedPos = null; }
    const initialCenter: [number, number] =
      savedPos && Array.isArray(savedPos)
        ? [savedPos[1], savedPos[0]]
        : [-0.4087, 42.1401];

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAPBOX_STYLE,
      center: initialCenter,
      zoom: 13,
      pitch: 0,
      bearing: 0,
      antialias: true,
      preserveDrawingBuffer: true,
      attributionControl: false,
      pitchWithRotate: false,
    });

    // If the map was initialized while its container had no real size yet
    // (e.g. deferred lazy mount), force a canvas resize right away.
    requestAnimationFrame(() => { map.current?.resize(); });
    setTimeout(() => { map.current?.resize(); }, 100);

    map.current.addControl(
      new mapboxgl.NavigationControl({
        showCompass: true,
        showZoom: false,
        visualizePitch: true,
      }),
      'top-right',
    );
    map.current.addControl(
      new mapboxgl.ScaleControl({ maxWidth: 100, unit: 'metric' }),
      'bottom-left',
    );

    map.current.on('load', () => {
      setMapReady(true);
      // If the canvas was created with a wrong size (deferred mount), keep it
      // in sync with the container so it never stays frozen/black.
      resizeObserverRef.current = new ResizeObserver(() => {
        map.current?.resize();
      });
      if (mapContainer.current) {
        resizeObserverRef.current.observe(mapContainer.current);
      }
      map.current.resize();
    });
    map.current.on('style.load', () => {
      setMapReady(true);
    });

    // Stop following when user manually pans
    map.current.on('dragstart', () => { isFollowingRef.current = false; });

    return () => {
      if (resumeFollowTimerRef.current !== null) {
        window.clearTimeout(resumeFollowTimerRef.current);
        resumeFollowTimerRef.current = null;
      }
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
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
      setRawUserLocation([42.1401, -0.4087]);
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
        try {
          localStorage.setItem('vimatch_last_pos', JSON.stringify(coords));
        } catch { /* ignore quota errors */ }

        // Filter GPS jitter: ignore micro-movements so the whole app doesn't
        // re-render on every tick. Marker still updates on real movement.
        const prev = lastPropagatedRef.current;
        if (prev && approxMetersBetween(prev, coords) < MIN_MOVE_METERS) return;
        lastPropagatedRef.current = coords;

        // Speed tier (with hysteresis) drives the dynamic camera zoom/pitch.
        const speedMs = position.coords.speed;
        if (speedMs != null && !isNaN(speedMs) && speedMs >= 0) {
          const kmh = speedMs * 3.6;
          setSpeedTier(prevTier => nextSpeedTier(kmh, prevTier));
        }

        setRawUserLocation(coords);
        if (position.coords.heading !== null && !isNaN(position.coords.heading)) {
          setUserHeading(position.coords.heading);
        }
        setPositionHistory(prev2 => [...prev2, coords].slice(-50));
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
    if (!map.current || !markerLocation) return;

    const tryMount = () => {
      if (!map.current) return;
      const m = map.current;
      const heading = getHeading();
      // Compensa la rotación del propio mapa para que el icono no gire el
      // doble de lo debido — ver markerScreenRotation() para el porqué.
      const markerRotation = markerScreenRotation(heading, m.getBearing());
      const el = buildUserMarkerEl(!!showRoute, markerRotation);

      if (!userMarkerRef.current) {
        userMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([markerLocation[1], markerLocation[0]])
          .addTo(m);
        // Salto instantáneo la primera vez — antes se deslizaba con
        // animación desde la posición guardada/por defecto hasta la
        // ubicación real, y se notaba como un "salto" en vez de aparecer
        // ya centrado en el sitio correcto.
        m.jumpTo({ center: [markerLocation[1], markerLocation[0]], zoom: 15 });
      } else {
        userMarkerRef.current.setLngLat([markerLocation[1], markerLocation[0]]);
        const cur = userMarkerRef.current.getElement();
        cur.innerHTML = el.innerHTML;
      }

      if (isFollowingRef.current) {
        if (isNavigating) {
          m.easeTo({
            center: [markerLocation[1], markerLocation[0]],
            bearing: simulatedHeading ?? heading ?? 0,
            pitch: 45,
            zoom: Math.max(m.getZoom(), 16),
            duration: 500,
          });
        } else {
          // Idle follow: keep the blue dot centred without forcing zoom/pitch/bearing.
          m.easeTo({
            center: [markerLocation[1], markerLocation[0]],
            duration: 500,
          });
        }
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
    if (!m.isStyleLoaded()) return;

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

    const ul = userLocationRef.current;
    if (!showRoute && ul) {
      const bounds = new mapboxgl.LngLatBounds()
        .extend([ul[1], ul[0]])
        .extend([destination.lng, destination.lat]);
      m.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 600 });
    }
  }, [destination, mapReady, showRoute]);

  // ── Route line (real Mapbox geometry, cualquier perfil) ────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;
    if (!m.isStyleLoaded()) {
      // El estilo puede estar recargándose justo cuando llega una ruta
      // nueva (p. ej. tras un cambio de modo) — antes esto se abandonaba
      // en silencio y la ruta se quedaba sin dibujar hasta el próximo
      // recálculo, que puede tardar hasta 18s o no llegar. En vez de eso,
      // se reintenta en cuanto el estilo termine de cargar.
      m.once('idle', () => { setStyleRetryTick(t => t + 1); });
      return;
    }

    if (!showRoute) {
      if (m.getLayer(LYR_ROUTE)) m.removeLayer(LYR_ROUTE);
      if (m.getSource(SRC_ROUTE)) m.removeSource(SRC_ROUTE);
      return;
    }
    // 2 puntos ya son una línea válida (un tramo recto, típico en rutas a
    // pie cortas) — antes se exigían más de 2 y esas rutas simples
    // desaparecían sin ningún error visible.
    if (!route || route.coordinates.length < 2) {
      // Si había una ruta dibujada de antes y la nueva falla, se quita en
      // vez de dejar la línea vieja (ya no válida) pegada en el mapa.
      if (m.getLayer(LYR_ROUTE)) m.removeLayer(LYR_ROUTE);
      if (m.getSource(SRC_ROUTE)) m.removeSource(SRC_ROUTE);
      return;
    }

    // Colour the route by real-time congestion (verde / ámbar / rojo)
    const data = toCongestionGeoJSON(route.coordinates, route.congestion);
    try {
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
            'line-color': CONGESTION_COLOR_EXPR,
            'line-width': 6,
            'line-opacity': 0.95,
          },
        });
      }
    } catch (err) {
      // No se deja morir en silencio: si Mapbox rechaza el source/layer
      // (p. ej. un ID que quedó a medias de un ciclo anterior), se limpia
      // y se deja constancia en consola para poder diagnosticarlo.
      console.error('MapView: fallo al dibujar la ruta', err);
      if (m.getLayer(LYR_ROUTE)) m.removeLayer(LYR_ROUTE);
      if (m.getSource(SRC_ROUTE)) m.removeSource(SRC_ROUTE);
    }
  }, [route, showRoute, mapReady, styleRetryTick]);

  // ── Walking route (passenger → meeting point) ─────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;
    if (!m.isStyleLoaded()) return;

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

  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;
    const refreshLabels = () => updateMarkerLabelVisibility();
    m.on('moveend', refreshLabels);
    m.on('zoomend', refreshLabels);
    return () => {
      m.off('moveend', refreshLabels);
      m.off('zoomend', refreshLabels);
    };
  }, [mapReady, updateMarkerLabelVisibility]);

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
      // El nombre real (p. ej. el pasajero de esa parada) tiene prioridad
      // sobre la etiqueta genérica — con varios pasajeros a la vez, todas
      // las recogidas mostraban el mismo "Parada 1 — Recogida" y no se
      // podían distinguir entre sí en el mapa.
      const label = wp.name || WAYPOINT_LABELS[wp.type];
      const el = buildMarkerEl(color, iconPath, label);
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([wp.lng, wp.lat])
        .addTo(m);
      waypointMarkersRef.current.push(marker);
    }

    requestAnimationFrame(updateMarkerLabelVisibility);

    // Auto-fit SOLO cuando hay varias paradas que mostrar a la vez
    // (recogida + destino). Con un único punto (solo destino elegido)
    // seguimos centrados en el usuario sin alejar ni pausar el seguimiento.
    if (waypointMarkers.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      const ul = userLocationRef.current;
      if (ul) bounds.extend([ul[1], ul[0]]);
      waypointMarkers.forEach(wp => bounds.extend([wp.lng, wp.lat]));
      if (!bounds.isEmpty()) {
        m.fitBounds(bounds, {
          padding: { top: 120, bottom: 250, left: 40, right: 40 },
          maxZoom: 14,
          duration: 1000,
        });
        // Temporarily stop following to show user + waypoints together, then
        // automatically resume continuous following once the animation is done.
        isFollowingRef.current = false;
        if (resumeFollowTimerRef.current !== null) {
          window.clearTimeout(resumeFollowTimerRef.current);
        }
        resumeFollowTimerRef.current = window.setTimeout(() => {
          isFollowingRef.current = true;
          resumeFollowTimerRef.current = null;
        }, 2500);
      }
    }
  }, [waypointMarkers, mapReady, updateMarkerLabelVisibility]);

  // ── Google-Maps-like 3D camera when navigating ────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    if (isNavigating) {
      // Dynamic camera: the faster you go, the further ahead you see.
      const { zoom, pitch } = TIER_CAMERA[speedTier];
      map.current.easeTo({ pitch, zoom, duration: 900 });
    } else {
      map.current.easeTo({ pitch: 0, zoom: 13, duration: 600 });
    }
  }, [isNavigating, mapReady, speedTier]);

  // ── Preview waypoints (before accepting match) — real road route ──────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;
    if (!m.isStyleLoaded()) return;

    previewMarkersRef.current.forEach(mk => mk.remove());
    previewMarkersRef.current = [];
    if (m.getLayer(LYR_PREVIEW)) m.removeLayer(LYR_PREVIEW);
    if (m.getSource(SRC_PREVIEW)) m.removeSource(SRC_PREVIEW);

    if (!previewWaypoints?.length) return;

    for (const wp of previewWaypoints) {
      const color = WAYPOINT_COLORS[wp.type] || ROUTE_COLOR;
      const iconPath = WAYPOINT_ICONS[wp.type] || WAYPOINT_ICONS.pickup;
      const label = wp.name || WAYPOINT_LABELS[wp.type];
      const el = buildMarkerEl(color, iconPath, label, true);
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([wp.lng, wp.lat])
        .addTo(m);
      previewMarkersRef.current.push(marker);
    }

    requestAnimationFrame(updateMarkerLabelVisibility);

    const ul = userLocationRef.current;
    if (ul && previewWaypoints.length >= 2) {
      const pickup = previewWaypoints[0];
      const dropoff = previewWaypoints[1];
      const points = [
        `${ul[1]},${ul[0]}`,
        `${pickup.lng},${pickup.lat}`,
        `${dropoff.lng},${dropoff.lat}`,
      ].join(';');

      fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${points}` +
          `?geometries=geojson&overview=simplified&access_token=${MAPBOX_TOKEN}`,
      )
        .then(r => r.json())
        .then(data => {
          if (!data.routes?.length || !map.current) return;
          const mm = map.current;
          if (!mm.isStyleLoaded()) return;
          const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
            type: 'Feature',
            properties: {},
            geometry: data.routes[0].geometry,
          };
          const src = mm.getSource(SRC_PREVIEW) as mapboxgl.GeoJSONSource | undefined;
          if (src) {
            src.setData(geojson);
          } else {
            mm.addSource(SRC_PREVIEW, { type: 'geojson', data: geojson });
            mm.addLayer({
              id: LYR_PREVIEW,
              type: 'line',
              source: SRC_PREVIEW,
              paint: {
                'line-color': 'hsl(24, 95%, 53%)',
                'line-width': 4,
                'line-opacity': 0.75,
                'line-dasharray': [2, 2],
              },
            });
          }
        })
        .catch(() => {});

      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([ul[1], ul[0]]);
      bounds.extend([pickup.lng, pickup.lat]);
      bounds.extend([dropoff.lng, dropoff.lat]);
      m.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 800 });
      // Temporarily stop following to show user + preview route, then
      // automatically resume continuous following once the animation is done.
      isFollowingRef.current = false;
      if (resumeFollowTimerRef.current !== null) {
        window.clearTimeout(resumeFollowTimerRef.current);
      }
      resumeFollowTimerRef.current = window.setTimeout(() => {
        isFollowingRef.current = true;
        resumeFollowTimerRef.current = null;
      }, 2500);
    }
  }, [previewWaypoints, mapReady, updateMarkerLabelVisibility]);

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

    const ul = userLocationRef.current;
    if (ul) {
      const bounds = new mapboxgl.LngLatBounds()
        .extend([ul[1], ul[0]])
        .extend(lngLat);
      if (destination) bounds.extend([destination.lng, destination.lat]);
      m.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 600 });
    }
  }, [driverLocation, driverLocationHistory, showDriverMarker, mapReady, destination]);

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
      <div ref={mapContainer} className="absolute inset-0 z-0" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
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
