import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useRouting, RouteData, TravelMode } from '@/hooks/useRouting';
import type { RoadAlert } from '@/hooks/useRoadAlerts';
import { ROAD_ALERT_LABEL } from '@/lib/roadAlerts';
import { useDeviceHeading } from '@/hooks/useDeviceHeading';
import { MAPBOX_TOKEN, MAPBOX_STYLE } from '@/lib/mapboxConfig';
import {
  MIN_MOVE_METERS,
  approxMetersBetween,
  cumulativeDistanceExceeds,
  computeBearing,
  markerScreenRotation,
  nextSpeedTier,
  nearestPointOnRoute,
  remainingRouteFrom,
  TIER_CAMERA,
  type SpeedTier,
} from '@/lib/mapGeo';
import {
  ROUTE_COLOR,
  toLineGeoJSON,
  toRouteGeoJSON,
  nearestCoordIndex,
  ROUTE_BEFORE_STOP_COLOR,
  TRAFFIC_BORDER_COLOR_EXPR,
  TRAFFIC_BORDER_FILTER,
} from '@/lib/mapGeoJSON';
import {
  WAYPOINT_COLORS,
  WAYPOINT_LABELS,
  WAYPOINT_ICONS,
  buildMarkerEl,
  buildUserMarkerEl,
  buildDriverMarkerEl,
  buildRoadAlertMarkerEl,
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
    type: 'meeting_point' | 'pickup' | 'dropoff' | 'final_destination' | 'errand';
    name: string;
  }>;
  onRouteUpdate?: (route: RouteData | null) => void;
  /** Called when the Directions request fails, with the error message (or null once it recovers). */
  onRouteError?: (error: string | null) => void;
  /** Called with true while a Directions request is in flight, false once it settles. */
  onRouteLoadingChange?: (loading: boolean) => void;
  simulatedPosition?: [number, number] | null;
  simulatedHeading?: number | null;
  onUserLocationUpdate?: (loc: [number, number]) => void;
  onGpsStatusChange?: (status: GpsStatus) => void;
  previewWaypoints?: Array<{
    lat: number;
    lng: number;
    type: 'pickup' | 'dropoff';
    name: string;
  }>;
  intermediateRouteWaypoints?: Array<{ lat: number; lng: number }>;
  /** Parada añadida desde el buscador: el tramo hasta ella va en morado. */
  purpleUntilStop?: { lat: number; lng: number } | null;
  /** Punto de encuentro del pasajero: marcador propio y visible. */
  meetingPoint?: { lat: number; lng: number; name: string } | null;
  /** A dónde se dirige el conductor ahora mismo (punto de encuentro, o tu
   *  posición real si es puerta a puerta) — para dibujar su ruta real hacia
   *  ti y para encuadrar la cámara en vosotros dos, no en todo el trayecto. */
  driverPickupPoint?: { lat: number; lng: number } | null;
  /** Avisos de carretera (radar, policía, accidente...) cerca, para pintar
   *  en el mapa — estilo Waze. */
  roadAlerts?: RoadAlert[];
  onConfirmRoadAlert?: (alert: RoadAlert, stillThere: boolean) => void;
}

// ── Visual constants ─────────────────────────────────────────────────────────
export type GpsStatus = 'searching' | 'ok' | 'denied' | 'lost' | 'unavailable';

const TRAIL_COLOR = 'hsl(199, 89%, 48%)';

// ── Source/layer IDs ─────────────────────────────────────────────────────────
const SRC_ROUTE = 'vm-route';
const LYR_ROUTE = 'vm-route-line';
const LYR_ROUTE_TRAFFIC = 'vm-route-traffic';
const LYR_ROUTE_BEFORE_STOP = 'vm-route-before-stop';
const SRC_TRAIL = 'vm-trail';
const LYR_TRAIL = 'vm-trail-line';
const SRC_PREVIEW = 'vm-preview';
const LYR_PREVIEW = 'vm-preview-line';
const SRC_DRIVER_ROUTE = 'vm-driver-route';
const LYR_DRIVER_ROUTE = 'vm-driver-route-line';
/** Mismo azul que la ruta principal de navegación — el conductor viniendo
 *  hacia ti es, visualmente, "tu" ruta todavía. */
const DRIVER_ROUTE_COLOR = ROUTE_COLOR;
/** No se vuelve a pedir la ruta por cada metro que se mueve el conductor. */
const DRIVER_ROUTE_REFETCH_METERS = 80;

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
  onRouteUpdate,
  onRouteError,
  onRouteLoadingChange,
  simulatedPosition,
  simulatedHeading,
  onUserLocationUpdate,
  onGpsStatusChange,
  previewWaypoints,
  intermediateRouteWaypoints,
  purpleUntilStop,
  meetingPoint,
  driverPickupPoint,
  roadAlerts,
  onConfirmRoadAlert,
}: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  // Para deslizar el punto azul entre una posición de GPS y la siguiente en
  // vez de saltar de golpe — antes cada fix nuevo (aunque llegara con un
  // hueco de 1-2s) se aplicaba con setLngLat directo, sin transición.
  const userMarkerAnimRef = useRef<number | null>(null);
  const userMarkerRenderedPosRef = useRef<[number, number] | null>(null);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const meetingMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const waypointMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const previewMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const roadAlertMarkersRef = useRef<mapboxgl.Marker[]>([]);

  // Desliza el punto azul desde su última posición dibujada hasta `target`
  // en MARKER_SLIDE_MS, en vez de saltar de golpe en cuanto llega un fix de
  // GPS nuevo. Si llega otro fix a mitad de la animación, se cancela la
  // anterior y se continúa desde donde iba (no desde el destino a medias),
  // así nunca hay un salto discontinuo.
  // Antes eran 900ms — suficiente para que no se notaran saltos, pero con
  // el punto notablemente por detrás de la posición real a velocidad de
  // coche. Se baja a 450ms: sigue absorbiendo el ruido normal del GPS sin
  // verse a trompicones, pero con mucho menos retraso.
  const animateUserMarkerTo = useCallback((target: [number, number]) => {
    const MARKER_SLIDE_MS = 450;
    if (userMarkerAnimRef.current != null) cancelAnimationFrame(userMarkerAnimRef.current);
    const start = userMarkerRenderedPosRef.current ?? target;
    const startTime = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / MARKER_SLIDE_MS);
      const lat = start[0] + (target[0] - start[0]) * t;
      const lng = start[1] + (target[1] - start[1]) * t;
      userMarkerRef.current?.setLngLat([lng, lat]);
      userMarkerRenderedPosRef.current = [lat, lng];
      if (t < 1) {
        userMarkerAnimRef.current = requestAnimationFrame(step);
      } else {
        userMarkerAnimRef.current = null;
      }
    };
    userMarkerAnimRef.current = requestAnimationFrame(step);
  }, []);

  const updateMarkerLabelVisibility = useCallback(() => {
    if (!map.current) return;

    const markers = [...waypointMarkersRef.current, ...previewMarkersRef.current, ...roadAlertMarkersRef.current];
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
  // Último estado de GPS reportado — en un ref (no state) solo para que el
  // reintento de abajo pueda leerlo sin provocar un re-render de más.
  const gpsStatusRef = useRef<GpsStatus>('searching');
  // Se incrementa cada pocos segundos SOLO mientras el GPS no esté "ok", para
  // forzar un reintento de watchPosition. Antes, si fallaba una vez (p. ej.
  // denegado), la app se quedaba así para siempre: conceder el permiso
  // después, desde los ajustes de Safari, no lo reactivaba solo — hacía
  // falta recargar toda la página para que el efecto volviera a arrancar.
  const [gpsRetryTick, setGpsRetryTick] = useState(0);

  const [rawUserLocation, setRawUserLocation] = useState<[number, number] | null>(null);
  // Para que el fix rápido de baja precisión (ver más abajo) sepa, de forma
  // síncrona, si ya hay una posición real antes de aplicarse — rawUserLocation
  // por sí solo no sirve dentro de un callback async, que vería el valor
  // "congelado" del render en que se creó el efecto.
  const rawUserLocationRef = useRef<[number, number] | null>(null);
  useEffect(() => { rawUserLocationRef.current = rawUserLocation; }, [rawUserLocation]);
  const [userHeading, setUserHeading] = useState<number | null>(null);
  // Rumbo de brújula real del dispositivo — responde a girar el móvil en la
  // mano, esté parado o en movimiento (a diferencia del rumbo GPS de abajo).
  const { heading: compassHeading, requestPermission: requestCompassPermission } = useDeviceHeading();
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

  // Posición "visual" del marcador — enganchada a la carretera cuando el GPS
  // crudo cae a pocos metros de la ruta ya calculada (reutiliza las mismas
  // coordenadas de Directions, sin llamada extra). Solo afecta a dónde se
  // DIBUJA el punto azul: toda la lógica de verdad (desvío de ruta, llegada
  // a recogida/destino, rumbo...) sigue usando markerLocation/rawUserLocation
  // crudos, para no enmascarar un desvío real detrás de un marcador "fiel".
  const displayLocation = useMemo(() => {
    if (!markerLocation || !route || route.coordinates.length < 2) return markerLocation;
    return nearestPointOnRoute(markerLocation, route.coordinates) ?? markerLocation;
  }, [markerLocation, route]);

  /** ¿Hay movimiento real suficiente para fiarse del rumbo del GPS? (~15 m)
   *  Antes eran 30m — se orientaba bien pero tardaba en notarse al
   *  arrancar. Bajado a petición explícita, sabiendo que a tan poca
   *  distancia el propio ruido del GPS pesa más. */
  const hasReliableMovement = useMemo(() => {
    if (positionHistory.length < 3) return false;
    return cumulativeDistanceExceeds(positionHistory, 15);
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

    // Con movimiento real confirmado por GPS (conduciendo, en bici...) el
    // rumbo de desplazamiento manda sobre la brújula — el imán del móvil
    // dentro de un coche (soporte magnético, altavoces, chasis metálico)
    // distorsiona la brújula justo cuando más se mueve, mientras que el
    // rumbo GPS se vuelve más fiable cuanto más rápido vas. Antes la
    // brújula ganaba siempre, así que conduciendo la flecha podía apuntar
    // para cualquier lado.
    if (hasReliableMovement) {
      if (userHeading !== null) return userHeading;
      const prev = positionHistory[positionHistory.length - 2];
      const curr = positionHistory[positionHistory.length - 1];
      const dLng = curr[1] - prev[1];
      const dLat = curr[0] - prev[0];
      return (Math.atan2(dLng, dLat) * 180) / Math.PI;
    }

    // Sin movimiento fiable: la brújula real del dispositivo es la única
    // fuente que responde a girar el móvil en la mano estando parado.
    if (compassHeading != null) return compassHeading;

    // Sin brújula ni movimiento, pero con ruta activa: orienta hacia el
    // destino en línea recta.
    if (showRoute && bearingToTarget !== null) return bearingToTarget;

    if (userHeading !== null) return userHeading;
    if (positionHistory.length >= 2) {
      const prev = positionHistory[positionHistory.length - 2];
      const curr = positionHistory[positionHistory.length - 1];
      const dLng = curr[1] - prev[1];
      const dLat = curr[0] - prev[0];
      return (Math.atan2(dLng, dLat) * 180) / Math.PI;
    }
    return 0;
  }, [simulatedHeading, compassHeading, userHeading, positionHistory, hasReliableMovement, bearingToTarget, showRoute]);

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

    // Pausa el seguimiento automático y programa su reanudación en RESUME_MS
    // — antes esto se quedaba desactivado para SIEMPRE hasta tocar a mano el
    // botón de centrar, así que arrastrar el mapa sin querer (un golpe en el
    // soporte del móvil) o simplemente tocar cualquier otro control (zoom,
    // ajustes, SOS...) lo dejaba sin seguir la posición el resto del viaje.
    // Cualquier toque nuevo reinicia la cuenta — solo se reanuda tras un
    // rato sin tocar NADA, igual que Google Maps/Waze.
    const RESUME_FOLLOW_MS = 45000;
    const pauseFollowAndScheduleResume = () => {
      isFollowingRef.current = false;
      if (resumeFollowTimerRef.current !== null) {
        window.clearTimeout(resumeFollowTimerRef.current);
      }
      resumeFollowTimerRef.current = window.setTimeout(() => {
        isFollowingRef.current = true;
        resumeFollowTimerRef.current = null;
      }, RESUME_FOLLOW_MS);
    };

    map.current.on('dragstart', pauseFollowAndScheduleResume);
    map.current.on('dragend', pauseFollowAndScheduleResume);

    // Lo mismo pero para cualquier otro elemento de la pantalla, no solo el
    // mapa — a nivel de window porque los botones (zoom, SOS, ajustes...)
    // los pinta el padre de MapView, no este componente.
    window.addEventListener('pointerdown', pauseFollowAndScheduleResume);

    return () => {
      window.removeEventListener('pointerdown', pauseFollowAndScheduleResume);
      if (resumeFollowTimerRef.current !== null) {
        window.clearTimeout(resumeFollowTimerRef.current);
        resumeFollowTimerRef.current = null;
      }
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (userMarkerAnimRef.current != null) cancelAnimationFrame(userMarkerAnimRef.current);
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // ── Brújula: pide permiso al primer toque real sobre el mapa ───────────────
  // iOS Safari exige que DeviceOrientationEvent.requestPermission() se llame
  // dentro de un gesto del usuario — pedirlo en un efecto sin más no hace
  // nada ahí. El primer toque sobre el mapa (arrastrar, tocar un marcador...)
  // cuenta como gesto real, así que basta con enganchar esto una sola vez.
  useEffect(() => {
    const el = mapContainer.current;
    if (!el) return;
    const handleFirstTouch = () => {
      requestCompassPermission();
      el.removeEventListener('pointerdown', handleFirstTouch);
    };
    el.addEventListener('pointerdown', handleFirstTouch, { once: true });
    return () => el.removeEventListener('pointerdown', handleFirstTouch);
  }, [requestCompassPermission]);

  // Reintenta watchPosition cada 4s mientras el GPS no esté "ok" — ver el
  // comentario de gpsRetryTick más arriba.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (gpsStatusRef.current !== 'ok') setGpsRetryTick((t) => t + 1);
    }, 4000);
    return () => window.clearInterval(id);
  }, []);

  const reportGpsStatus = useCallback((status: GpsStatus) => {
    gpsStatusRef.current = status;
    onGpsStatusChange?.(status);
  }, [onGpsStatusChange]);

  // ── Watch user GPS ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    if (!('geolocation' in navigator)) {
      reportGpsStatus('unavailable');
      return;
    }

    // Petición rápida de baja precisión (red/wifi, casi instantánea) en
    // paralelo al watchPosition de alta precisión de abajo — sin esto, al
    // abrir la app se quedaba en "Buscando tu ubicación…" todo el rato que
    // tardara el GPS en conseguir el primer punto preciso, que al aire
    // libre suele ser rápido pero en interiores o con mala señal puede
    // tardar bastante. En cuanto llega el punto preciso, lo sustituye.
    let quickFixApplied = false;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (quickFixApplied || rawUserLocationRef.current) return;
        quickFixApplied = true;
        setRawUserLocation([position.coords.latitude, position.coords.longitude]);
        reportGpsStatus('ok');
      },
      () => { /* sin red/permiso: el watchPosition de abajo sigue intentándolo */ },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 },
    );

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

        reportGpsStatus('ok');
        setRawUserLocation(coords);
        if (position.coords.heading !== null && !isNaN(position.coords.heading)) {
          setUserHeading(position.coords.heading);
        }
        setPositionHistory(prev2 => [...prev2, coords].slice(-50));
      },
      (error) => {
        console.error('Geolocation error:', error);
        if (error.code === error.PERMISSION_DENIED) {
          // Solo se avisa una vez por racha de fallo — si no, el reintento
          // automático cada 4s dispararía este toast una y otra vez
          // mientras el permiso siga sin concederse.
          if (gpsStatusRef.current !== 'denied') {
            window.dispatchEvent(new CustomEvent('vimatch:gps-denied'));
          }
          reportGpsStatus('denied');
        } else {
          reportGpsStatus('lost');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [mapReady, gpsRetryTick, reportGpsStatus]);

  // ── User marker + auto-follow during navigation ───────────────────────────
  useEffect(() => {
    if (!map.current || !displayLocation) return;

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
          .setLngLat([displayLocation[1], displayLocation[0]])
          .addTo(m);
        userMarkerRenderedPosRef.current = displayLocation;
        // Salto instantáneo la primera vez — antes se deslizaba con
        // animación desde la posición guardada/por defecto hasta la
        // ubicación real, y se notaba como un "salto" en vez de aparecer
        // ya centrado en el sitio correcto.
        m.jumpTo({ center: [displayLocation[1], displayLocation[0]], zoom: 15 });
      } else {
        animateUserMarkerTo(displayLocation);
        const cur = userMarkerRef.current.getElement();
        cur.innerHTML = el.innerHTML;
      }

      if (isFollowingRef.current) {
        if (isNavigating) {
          m.easeTo({
            center: [displayLocation[1], displayLocation[0]],
            bearing: simulatedHeading ?? heading ?? 0,
            pitch: 45,
            zoom: Math.max(m.getZoom(), 16),
            duration: 500,
          });
        } else {
          // Idle follow: keep the blue dot centred without forcing zoom/pitch/bearing.
          m.easeTo({
            center: [displayLocation[1], displayLocation[0]],
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
  }, [rawUserLocation, simulatedPosition, displayLocation, mapReady, showRoute, isNavigating, simulatedHeading, getHeading, animateUserMarkerTo]);

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

  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;
    meetingMarkerRef.current?.remove();
    meetingMarkerRef.current = null;
    if (!meetingPoint) return;

    const el = document.createElement('div');
    el.className = 'flex flex-col items-center pointer-events-none';
    el.innerHTML = `
      <div style="background:hsl(280,70%,55%);color:white;font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.4);white-space:nowrap;margin-bottom:4px">Punto de encuentro</div>
      <div style="width:22px;height:22px;border-radius:50%;background:hsl(280,70%,55%);border:3px solid white;box-shadow:0 0 0 6px hsla(280,70%,55%,.35)"></div>`;
    meetingMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([meetingPoint.lng, meetingPoint.lat])
      .addTo(m);
  }, [meetingPoint, mapReady, styleRetryTick]);

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

    const removeRouteLayers = () => {
      if (m.getLayer(LYR_ROUTE_BEFORE_STOP)) m.removeLayer(LYR_ROUTE_BEFORE_STOP);
      if (m.getLayer(LYR_ROUTE)) m.removeLayer(LYR_ROUTE);
      if (m.getLayer(LYR_ROUTE_TRAFFIC)) m.removeLayer(LYR_ROUTE_TRAFFIC);
      if (m.getSource(SRC_ROUTE)) m.removeSource(SRC_ROUTE);
    };

    if (!showRoute) {
      removeRouteLayers();
      return;
    }
    // 2 puntos ya son una línea válida (un tramo recto, típico en rutas a
    // pie cortas) — antes se exigían más de 2 y esas rutas simples
    // desaparecían sin ningún error visible.
    if (!route || route.coordinates.length < 2) {
      // Si había una ruta dibujada de antes y la nueva falla, se quita en
      // vez de dejar la línea vieja (ya no válida) pegada en el mapa.
      removeRouteLayers();
      return;
    }

    // Mientras se navega de verdad, recorta lo ya recorrido — antes la
    // línea se quedaba fija desde el origen aunque ya se hubiera avanzado
    // la mitad del trayecto, sin "borrarse" como en cualquier app de
    // navegación normal.
    const { coordinates: visibleCoordinates, congestion: visibleCongestion } =
      isNavigating && rawUserLocation
        ? remainingRouteFrom(rawUserLocation, route.coordinates, route.congestion)
        : { coordinates: route.coordinates, congestion: route.congestion };

    // Morado hasta la parada añadida desde el buscador, azul después.
    const splitIndex = purpleUntilStop ? nearestCoordIndex(visibleCoordinates, purpleUntilStop) : null;
    const data = toRouteGeoJSON(visibleCoordinates, visibleCongestion, splitIndex);
    try {
      const src = m.getSource(SRC_ROUTE) as mapboxgl.GeoJSONSource | undefined;
      if (src) {
        src.setData(data);
      } else {
        m.addSource(SRC_ROUTE, { type: 'geojson', data });
        // Borde de tráfico debajo: verde = mucho tráfico fluyendo, rojo = retención.
        m.addLayer({
          id: LYR_ROUTE_TRAFFIC,
          type: 'line',
          source: SRC_ROUTE,
          filter: TRAFFIC_BORDER_FILTER,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': TRAFFIC_BORDER_COLOR_EXPR,
            'line-width': 10,
            'line-opacity': 0.9,
          },
        });
        // Azul (después de la parada) debajo y morado (hasta la parada) encima:
        // donde la ruta vuelve por la misma calle, gana el morado.
        m.addLayer({
          id: LYR_ROUTE,
          type: 'line',
          source: SRC_ROUTE,
          filter: ['==', ['get', 'phase'], 'after'],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ROUTE_COLOR,
            'line-width': 6,
            'line-opacity': 0.95,
          },
        });
        m.addLayer({
          id: LYR_ROUTE_BEFORE_STOP,
          type: 'line',
          source: SRC_ROUTE,
          filter: ['==', ['get', 'phase'], 'before'],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ROUTE_BEFORE_STOP_COLOR,
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
      removeRouteLayers();
    }
  }, [route, showRoute, mapReady, styleRetryTick, purpleUntilStop, isNavigating, rawUserLocation]);

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

  // ── Avisos de carretera (radar, policía, accidente...) ────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;

    roadAlertMarkersRef.current.forEach(mk => mk.remove());
    roadAlertMarkersRef.current = [];

    if (!roadAlerts?.length) return;

    for (const alert of roadAlerts) {
      const label = ROAD_ALERT_LABEL[alert.kind];
      const el = buildRoadAlertMarkerEl(label);

      const popupEl = document.createElement('div');
      popupEl.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:150px;';
      const title = document.createElement('p');
      title.textContent = `${label} — ¿sigue ahí?`;
      title.style.cssText = 'font-size:12px;font-weight:600;color:#111;margin:0;';
      popupEl.appendChild(title);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;';
      const yesBtn = document.createElement('button');
      yesBtn.textContent = 'Sigue ahí';
      yesBtn.style.cssText = 'flex:1;font-size:11px;padding:4px 8px;border-radius:8px;background:#16a34a;color:white;border:none;';
      yesBtn.onclick = () => onConfirmRoadAlert?.(alert, true);
      const noBtn = document.createElement('button');
      noBtn.textContent = 'Ya no está';
      noBtn.style.cssText = 'flex:1;font-size:11px;padding:4px 8px;border-radius:8px;background:#dc2626;color:white;border:none;';
      noBtn.onclick = () => onConfirmRoadAlert?.(alert, false);
      row.appendChild(yesBtn);
      row.appendChild(noBtn);
      popupEl.appendChild(row);

      const popup = new mapboxgl.Popup({ offset: 20, closeButton: true }).setDOMContent(popupEl);

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([alert.lng, alert.lat])
        .setPopup(popup)
        .addTo(m);
      roadAlertMarkersRef.current.push(marker);
    }
    requestAnimationFrame(updateMarkerLabelVisibility);
  }, [roadAlerts, mapReady, onConfirmRoadAlert, updateMarkerLabelVisibility]);

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

      // Al asignarte un conductor, lo primero es centrar en TU ubicación —
      // no unos bounds que incluyan también al conductor, que puede
      // arrancar a 2km y forzaba un zoom muy alejado nada más aparecer.
      // Antes además
      // esto se repetía en CADA actualización de posición (cada segundo,
      // con un conductor simulado moviéndose), así que la cámara no paraba
      // de recentrarse sola y no dejaba mover el mapa a mano. Ahora se
      // centra una sola vez, al aparecer, y luego queda libre: puedes
      // arrastrar el mapa para seguir por dónde viene sin que se resetee.
      const ul = userLocationRef.current;
      if (ul) {
        isFollowingRef.current = true;
        m.easeTo({ center: [ul[1], ul[0]], zoom: Math.max(m.getZoom(), 15), duration: 600 });
      }
    } else {
      driverMarkerRef.current.setLngLat(lngLat);
    }
  }, [driverLocation, driverLocationHistory, showDriverMarker, mapReady]);

  // ── Ruta real del conductor hacia el punto de recogida (vista pasajero) ────
  const lastDriverRouteFetchRef = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const m = map.current;

    const removeDriverRouteLayer = () => {
      if (m.getLayer(LYR_DRIVER_ROUTE)) m.removeLayer(LYR_DRIVER_ROUTE);
      if (m.getSource(SRC_DRIVER_ROUTE)) m.removeSource(SRC_DRIVER_ROUTE);
      lastDriverRouteFetchRef.current = null;
    };

    if (!showDriverMarker || !driverLocation || !driverPickupPoint) {
      removeDriverRouteLayer();
      return;
    }

    const from: [number, number] = [driverLocation.latitude, driverLocation.longitude];
    const last = lastDriverRouteFetchRef.current;
    if (last) {
      const movedM = Math.sqrt((from[0] - last[0]) ** 2 + (from[1] - last[1]) ** 2) * 111_320;
      if (movedM < DRIVER_ROUTE_REFETCH_METERS) return;
    }
    lastDriverRouteFetchRef.current = from;

    const coords = `${from[1]},${from[0]};${driverPickupPoint.lng},${driverPickupPoint.lat}`;
    fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?geometries=geojson&overview=simplified&access_token=${MAPBOX_TOKEN}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data?.routes?.length || !map.current) return;
        const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
          type: 'Feature',
          properties: {},
          geometry: data.routes[0].geometry,
        };
        const mm = map.current;
        const src = mm.getSource(SRC_DRIVER_ROUTE) as mapboxgl.GeoJSONSource | undefined;
        if (src) {
          src.setData(geojson);
        } else {
          mm.addSource(SRC_DRIVER_ROUTE, { type: 'geojson', data: geojson });
          mm.addLayer({
            id: LYR_DRIVER_ROUTE,
            type: 'line',
            source: SRC_DRIVER_ROUTE,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': DRIVER_ROUTE_COLOR,
              'line-width': 4,
              'line-opacity': 0.8,
              'line-dasharray': [2, 2],
            },
          });
        }
      })
      .catch(() => {});
  }, [driverLocation, driverPickupPoint, showDriverMarker, mapReady]);

  // ── Expose map controls to window for the bottom-bar zoom buttons ─────────
  useEffect(() => {
    (window as any).__mapCenterOnUser = centerOnUser;
    (window as any).__mapZoomIn = zoomIn;
    (window as any).__mapZoomOut = zoomOut;
    // Para el botón "Reintentar" del aviso de GPS — fuerza un reintento
    // inmediato en vez de esperar a los 4s del reintento automático.
    (window as any).__mapRetryGps = () => setGpsRetryTick((t) => t + 1);
    return () => {
      delete (window as any).__mapCenterOnUser;
      delete (window as any).__mapZoomIn;
      delete (window as any).__mapZoomOut;
      delete (window as any).__mapRetryGps;
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
