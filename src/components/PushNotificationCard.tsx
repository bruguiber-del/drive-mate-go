import { useState } from 'react';
import { Bell, BellOff, BellRing, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

/**
 * Activa los avisos push — sin esto, enterarse de una petición nueva o de
 * que te han aceptado dependía de tener la app abierta mirando la
 * pantalla.
 */
const PushNotificationCard = () => {
  const { permission, subscribing, subscribe, resubscribe } = usePushNotifications();
  const { toast } = useToast();
  const [sendingTest, setSendingTest] = useState(false);

  // El navegador no vuelve a pedir permiso una vez concedido, así que si la
  // clave VAPID del servidor cambia (p. ej. al rotarla), la única forma de
  // que este dispositivo vuelva a quedar suscrito correctamente es forzarlo
  // desde aquí — de lo contrario "Probar" seguiría fallando sin más pista.
  const handleResubscribe = async () => {
    const ok = await resubscribe();
    toast(
      ok
        ? { title: 'Suscripción renovada', description: 'Prueba ahora a mandarte un aviso.', duration: 2500 }
        : { title: 'No se pudo renovar', description: 'Inténtalo de nuevo en un momento.', variant: 'destructive', duration: 3500 },
    );
  };

  // Sin esto, comprobar que un aviso de verdad llega al móvil dependía de
  // tener dos cuentas haciendo un viaje real a la vez — con este botón
  // basta con probarlo solo, contra tu propio dispositivo.
  const sendTestNotification = async () => {
    setSendingTest(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          targetUserId: userId,
          title: 'VIMATCH',
          body: 'Si ves esto, las notificaciones funcionan.',
          tag: 'test',
        },
      });
      const sent = (data as { sent?: number } | null)?.sent ?? 0;
      if (error || sent === 0) {
        toast({
          title: 'No llegó ningún aviso',
          description: 'Comprueba que las notificaciones siguen permitidas para este sitio.',
          variant: 'destructive',
          duration: 3500,
        });
      } else {
        toast({ title: 'Aviso de prueba enviado', description: 'Debería llegarte en unos segundos.', duration: 2500 });
      }
    } finally {
      setSendingTest(false);
    }
  };

  if (permission === 'unsupported') return null;

  return (
    <div className="glass rounded-xl p-4 flex items-center gap-3 mb-3">
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          permission === 'granted' ? 'bg-success/20' : 'bg-muted'
        }`}
      >
        {permission === 'granted' ? (
          <BellRing className="w-5 h-5 text-success" />
        ) : permission === 'denied' ? (
          <BellOff className="w-5 h-5 text-muted-foreground" />
        ) : (
          <Bell className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground">Notificaciones</p>
        <p className="text-sm text-muted-foreground">
          {permission === 'granted'
            ? 'Activadas — te avisamos aunque no tengas la app abierta'
            : permission === 'denied'
              ? 'Bloqueadas en el navegador — actívalas desde los ajustes del sitio'
              : 'Avísanos cuando tengas una petición o te acepten un viaje'}
        </p>
      </div>
      {permission === 'granted' && (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={subscribing} onClick={handleResubscribe} title="Renovar suscripción">
            {subscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
          <Button size="sm" variant="ghost" disabled={sendingTest} onClick={sendTestNotification}>
            {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Probar'}
          </Button>
        </div>
      )}
      {permission !== 'granted' && permission !== 'denied' && (
        <Button size="sm" disabled={subscribing} onClick={subscribe}>
          {subscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Activar'}
        </Button>
      )}
    </div>
  );
};

export default PushNotificationCard;
