import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';

/**
 * Activa los avisos push — sin esto, enterarse de una petición nueva o de
 * que te han aceptado dependía de tener la app abierta mirando la
 * pantalla.
 */
const PushNotificationCard = () => {
  const { permission, subscribing, subscribe } = usePushNotifications();

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
      {permission !== 'granted' && permission !== 'denied' && (
        <Button size="sm" disabled={subscribing} onClick={subscribe}>
          {subscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Activar'}
        </Button>
      )}
    </div>
  );
};

export default PushNotificationCard;
