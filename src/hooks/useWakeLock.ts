import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';

/**
 * Evita que la pantalla se apague sola mientras `enabled` es true — sin
 * esto, usada como navegador de verdad (móvil apoyado en el salpicadero),
 * el móvil se bloqueaba por inactividad a media ruta como cualquier web
 * normal.
 *
 * Dos vías distintas según dónde se ejecute, igual que useDeviceHeading:
 * - App nativa (Capacitor/WKWebView): la Screen Wake Lock API web NO existe
 *   ahí (a diferencia de Safari de verdad, que sí la soporta desde 16.4) —
 *   por eso la app nativa se seguía apagando aunque esta misma función ya
 *   llevara tiempo escrita. Se usa @capacitor-community/keep-awake, que
 *   llama al mecanismo nativo de iOS (UIApplication.isIdleTimerDisabled),
 *   sin depender de ninguna API del navegador.
 * - Web normal: Screen Wake Lock API, como antes. El propio sistema libera
 *   el bloqueo si la pestaña pasa a segundo plano; al volver, se vuelve a
 *   pedir solo mientras `enabled` siga activo.
 */
export function useWakeLock(enabled: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled) return;

    if (Capacitor.isNativePlatform()) {
      KeepAwake.keepAwake().catch(() => { /* no soportado en este dispositivo */ });
      return () => {
        KeepAwake.allowSleep().catch(() => {});
      };
    }

    if (!('wakeLock' in navigator)) return;
    let cancelled = false;

    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // Denegado (p. ej. batería muy baja) o pestaña no visible — no hay
        // más que hacer desde una web; se reintentará en el siguiente
        // cambio de visibilidad.
      }
    };

    acquire();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinelRef.current) acquire();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };
  }, [enabled]);
}
