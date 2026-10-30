import { useEffect, useRef } from 'react';

/**
 * Evita que la pantalla se apague sola mientras `enabled` es true — sin
 * esto, usada como navegador de verdad (móvil apoyado en el salpicadero),
 * el móvil se bloqueaba por inactividad a media ruta como cualquier web
 * normal.
 *
 * Solo funciona si el navegador soporta la Screen Wake Lock API (Chrome/
 * Edge en Android y escritorio, Safari 16.4+ en iOS; Firefox todavía no la
 * soporta) — sin ella no hay forma de hacerlo desde una web, haría falta
 * una app nativa. El propio sistema libera el bloqueo si la pestaña pasa a
 * segundo plano (p. ej. cambias de app un momento); al volver, se vuelve a
 * pedir automáticamente mientras `enabled` siga activo.
 */
export function useWakeLock(enabled: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
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
