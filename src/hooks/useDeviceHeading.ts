import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { CapgoCompass } from '@capgo/capacitor-compass';

/** Safari en iOS expone un campo propio con el rumbo absoluto ya resuelto;
 *  el resto de navegadores solo dan alpha (relativo al punto donde estaba
 *  el móvil al empezar a escuchar, no al norte). */
interface CompassOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

type PermissionState = 'unknown' | 'granted' | 'denied' | 'unsupported';

/**
 * Rumbo real del dispositivo (brújula), 0-360° en sentido horario desde el
 * norte — a diferencia del rumbo GPS (que solo existe moviéndose) esto
 * responde al instante a girar el móvil en la mano, quieto o no. Antes el
 * marcador de ubicación solo giraba con el curso GPS o apuntaba siempre al
 * destino, así que girar el teléfono parado no hacía nada.
 *
 * Dos fuentes de datos completamente distintas según dónde se ejecute:
 * - App nativa (empaquetada con Capacitor, en el iPhone de verdad): usa
 *   @capgo/capacitor-compass, que lee el CLLocationManager real de iOS —
 *   el mismo permiso NATIVO que usa Google Maps (Ajustes > Privacidad >
 *   Localización), que se pide solo al abrir, sin ningún toque, y que iOS
 *   recuerda para siempre entre sesiones.
 * - Web normal (el sitio abierto en Safari, sin empaquetar): usa la API
 *   web DeviceOrientationEvent, que por restricción de Apple SIEMPRE exige
 *   un gesto real del usuario para pedirse, en cada carga de página —
 *   ninguna web puede evitar esto, ni siquiera la propia Google Maps web.
 */
/** Distancia angular con signo entre dos rumbos (-180..180), sin el salto
 *  raro de cruzar 0°/360° que da una resta directa. */
function headingDelta(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

export function useDeviceHeading() {
  const [heading, setHeading] = useState<number | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown');
  const listenerAttachedRef = useRef(false);
  const lastCommittedRef = useRef<number | null>(null);
  const isNative = Capacitor.isNativePlatform();

  // El sensor dispara a 30-60 Hz (más rápido que el GPS), y cada valor nuevo
  // re-renderizaba todo lo que depende del rumbo — incluida la cámara del
  // mapa, que reiniciaba su animación de giro a medio hacer en cada tick, lo
  // que se notaba como un tirón/zumbido constante en vez de un giro suave.
  // Solo se compromete a React un cambio real (>=2°), filtrando el ruido del
  // sensor sin perder capacidad de respuesta ante un giro de verdad.
  const commitHeading = useCallback((value: number) => {
    const prev = lastCommittedRef.current;
    if (prev !== null && Math.abs(headingDelta(value, prev)) < 2) return;
    lastCommittedRef.current = value;
    setHeading(value);
  }, []);

  // ── Rama nativa ──────────────────────────────────────────────────────────
  const nativeHandleRef = useRef<{ remove: () => Promise<void> } | null>(null);

  const startNativeListening = useCallback(async () => {
    if (nativeHandleRef.current) return;
    nativeHandleRef.current = await CapgoCompass.addListener('headingChange', (event) => {
      commitHeading(event.value);
    });
    await CapgoCompass.startListening();
  }, [commitHeading]);

  const requestPermissionNative = useCallback(async (): Promise<boolean> => {
    try {
      const status = await CapgoCompass.requestPermissions();
      const granted = status.compass === 'granted';
      setPermissionState(granted ? 'granted' : 'denied');
      if (granted) await startNativeListening();
      return granted;
    } catch {
      setPermissionState('unsupported');
      return false;
    }
  }, [startNativeListening]);

  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await CapgoCompass.checkPermissions();
        if (cancelled) return;
        if (status.compass === 'granted') {
          setPermissionState('granted');
          await startNativeListening();
        } else {
          // A diferencia de la web, este permiso NO exige ningún gesto del
          // usuario — es el permiso nativo de Localización de iOS, así que
          // se puede pedir solo, nada más abrir la app.
          await requestPermissionNative();
        }
      } catch {
        if (!cancelled) setPermissionState('unsupported');
      }
    })();
    return () => {
      cancelled = true;
      nativeHandleRef.current?.remove();
      nativeHandleRef.current = null;
      CapgoCompass.stopListening().catch(() => { /* ya se estaba parando sola */ });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative]);

  const handleOrientation = useCallback((event: Event) => {
    const e = event as CompassOrientationEvent;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
      // iOS Safari: ya viene como rumbo absoluto respecto al norte.
      commitHeading(e.webkitCompassHeading);
      return;
    }
    if (e.alpha == null) return;
    // Conversión estándar de alpha (sentido antihorario desde un origen
    // arbitrario) a rumbo de brújula (sentido horario desde el norte).
    commitHeading((360 - e.alpha) % 360);
  }, [commitHeading]);

  const attachListener = useCallback(() => {
    if (listenerAttachedRef.current || typeof window === 'undefined') return;
    listenerAttachedRef.current = true;
    const hasAbsoluteOrientation = 'ondeviceorientationabsolute' in window;
    const eventName = hasAbsoluteOrientation ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(eventName, handleOrientation, true);
  }, [handleOrientation]);

  const detachListener = useCallback(() => {
    if (!listenerAttachedRef.current) return;
    window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
    window.removeEventListener('deviceorientation', handleOrientation, true);
    listenerAttachedRef.current = false;
  }, [handleOrientation]);

  /** iOS 13+ exige pedir permiso desde un gesto real del usuario (un toque)
   *  antes de que el sensor dispare ningún evento — llamar a esto fuera de
   *  un gesto (p. ej. en un useEffect) no hace nada en Safari. Android y
   *  escritorio no piden permiso, así que ahí esto solo engancha el listener. */
  const requestPermissionWeb = useCallback(async (): Promise<boolean> => {
    const DOE = (typeof window !== 'undefined' ? window.DeviceOrientationEvent : undefined) as
      | (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> })
      | undefined;
    if (!DOE) {
      setPermissionState('unsupported');
      return false;
    }
    if (typeof DOE.requestPermission === 'function') {
      try {
        const result = await DOE.requestPermission();
        setPermissionState(result === 'granted' ? 'granted' : 'denied');
        if (result === 'granted') attachListener();
        return result === 'granted';
      } catch {
        setPermissionState('denied');
        return false;
      }
    }
    setPermissionState('granted');
    attachListener();
    return true;
  }, [attachListener]);

  useEffect(() => {
    // La rama nativa de más arriba ya se encarga enteramente de esto.
    if (isNative) return;
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setPermissionState('unsupported');
      return;
    }
    const DOE = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    // Solo se engancha solo si el navegador NO exige permiso explícito
    // (Android/escritorio) — en iOS hay que esperar a requestPermission()
    // desde un toque real.
    if (typeof DOE.requestPermission !== 'function') {
      attachListener();
      setPermissionState('granted');
    }
    return detachListener;
  }, [isNative, attachListener, detachListener]);

  const requestPermission = useCallback((): Promise<boolean> => {
    return isNative ? requestPermissionNative() : requestPermissionWeb();
  }, [isNative, requestPermissionNative, requestPermissionWeb]);

  return { heading, permissionState, requestPermission };
}
