import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Sin el ArrayBuffer explícito, el tipo inferido es Uint8Array<ArrayBufferLike>
// y TypeScript lo rechaza donde PushManager espera BufferSource.
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes;
}

// La clave pública de avisos puede venir incrustada en el build o pedirse a la
// función de notificaciones; la clave pública no es secreta.
async function resolveVapidKey(): Promise<string | undefined> {
  const fromEnv = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (fromEnv) return fromEnv;
  try {
    const { data } = await supabase.functions.invoke('send-push-notification', { method: 'GET' });
    return (data as { publicKey?: string } | null)?.publicKey;
  } catch {
    return undefined;
  }
}

export type PushPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

async function saveSubscription(subscription: PushSubscription) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return false;

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'endpoint' },
  );
  return !error;
}

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
    const vapidPublicKey = await resolveVapidKey();
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

      return await saveSubscription(subscription);
    } catch {
      return false;
    } finally {
      setSubscribing(false);
    }
  }, [permission]);

  // El navegador recuerda el permiso para siempre una vez concedido, pero la
  // suscripción en sí sigue atada a la clave VAPID con la que se creó — si
  // esa clave cambia (p. ej. tras rotarla), la suscripción vieja deja de
  // servir y no hay forma de volver a "Activar" porque el permiso ya está
  // concedido. Esto fuerza a tirar la suscripción vieja y crear una nueva
  // con la clave pública actual.
  const resubscribe = useCallback(async () => {
    if (permission !== 'granted') return false;
    const vapidPublicKey = await resolveVapidKey();
    if (!vapidPublicKey) return false;

    setSubscribing(true);
    try {
      const registration = await navigator.serviceWorker.register('/push-sw.js');
      await navigator.serviceWorker.ready;

      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', existing.endpoint);
        await existing.unsubscribe();
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      return await saveSubscription(subscription);
    } catch {
      return false;
    } finally {
      setSubscribing(false);
    }
  }, [permission]);

  return { permission, subscribing, subscribe, resubscribe };
}
