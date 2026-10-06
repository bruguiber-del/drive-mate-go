import { useState, useEffect, useCallback, useRef } from 'react';

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
 */
export function useDeviceHeading() {
  const [heading, setHeading] = useState<number | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown');
  const listenerAttachedRef = useRef(false);

  const handleOrientation = useCallback((event: Event) => {
    const e = event as CompassOrientationEvent;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
      // iOS Safari: ya viene como rumbo absoluto respecto al norte.
      setHeading(e.webkitCompassHeading);
      return;
    }
    if (e.alpha == null) return;
    // Conversión estándar de alpha (sentido antihorario desde un origen
    // arbitrario) a rumbo de brújula (sentido horario desde el norte).
    setHeading((360 - e.alpha) % 360);
  }, []);

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
  const requestPermission = useCallback(async (): Promise<boolean> => {
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
  }, [attachListener, detachListener]);

  return { heading, permissionState, requestPermission };
}
