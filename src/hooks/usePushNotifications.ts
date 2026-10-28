import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type PushPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

/**
 * Pide permiso de notificaciones push y guarda la suscripción — sin esto,
 * enterarse de una petición nueva o de que te han aceptado dependía de
 * tener la app abierta mirando la pantalla.
 */
export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>('default');
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission as PushPermissionState);
  }, []);

  const subscribe = useCallback(async () => {
    if (permission === 'unsupported') return false;
    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!vapidPublicKey) return false;

    setSubscribing(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PushPermissionState);
      if (result !== 'granted') return false;

      const registration = await navigator.serviceWorker.register('/push-sw.js');
      await navigator.serviceWorker.ready;

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return false;

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

      await supabase.from('push_subscriptions').upsert(
        {
          user_id: userId,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        { onConflict: 'endpoint' },
      );
      return true;
    } catch {
      return false;
    } finally {
      setSubscribing(false);
    }
  }, [permission]);

  return { permission, subscribing, subscribe };
}
