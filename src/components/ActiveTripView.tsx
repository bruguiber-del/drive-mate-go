import { memo } from 'react';
import { motion } from 'framer-motion';
import { Phone, MessageCircle, MapPin, Clock, Navigation, User, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActiveTripViewProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: 'driver' | 'passenger';
  tripStatus?: 'waiting' | 'picked_up' | 'in_progress';
  onPickup?: () => void;
  /** Minutes until reaching the passenger pickup point */
  pickupEta?: number;
  /** Minutes until dropping the passenger at their destination */
  dropoffEta?: number;
  /** Driver view: true mientras queden recogidas/bajadas pendientes de
   *  algún pasajero — esas acciones se confirman con las chapas del
   *  lateral derecho (StopConfirmButtons), no desde esta tarjeta, así que
   *  aquí se ocultan el punto de recogida y el botón de acción principal
   *  para no duplicarlos. "Cancelar" sigue disponible siempre. */
  hasMoreStops?: boolean;
  tripData?: {
    otherUser: string;
    otherUserRating: number;
    origin: string;
    destination: string;
    pickupPoint: string;
    eta: number;
    price: number;
  };
}

const defaultData = {
  otherUser: 'Ana M.',
  otherUserRating: 4.8,
  origin: 'Huesca',
  destination: 'Zaragoza',
  pickupPoint: 'Estación de autobuses, Huesca',
  eta: 5,
  price: 6.50,
};

/** Solo para el conductor — el pasajero tiene su propia chapa compacta
 *  (StopConfirmButtons, con su botón de cancelar) que ya cubre recogida,
 *  bajada y cancelar sin necesidad de esta tarjeta. */
const ActiveTripView = ({ isOpen, onClose, userRole, tripStatus = 'waiting', onPickup, pickupEta, dropoffEta, hasMoreStops = false, tripData }: ActiveTripViewProps) => {
  const data = tripData || defaultData;

  if (!isOpen || userRole === 'passenger') return null;

  // Con paradas pendientes, O sin ninguna ya (todos bajados, camino de su
  // propio destino): nada de avatar/estrellas/ETA tiene sentido aquí — con
  // paradas pendientes, ese detalle ya vive en las chapas de
  // StopConfirmButtons; sin paradas, el ETA/km hasta destino ya lo da el
  // aviso de navegación de arriba, repetirlo abajo en una chapa aparte
  // (encima pegada a los controles de zoom) era la misma información dos
  // veces. Se queda solo un botón mínimo para cancelar el viaje entero —
  // no hace falta más: el cierre normal, al llegar de verdad (GPS) a tu
  // destino, ya es automático.
  if (hasMoreStops || tripStatus === 'picked_up') {
    return (
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.7, opacity: 0 }}
        className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40"
      >
        <Button
          variant="destructive"
          size="icon-sm"
          className="h-9 w-9 rounded-full shadow-lg"
          onClick={onClose}
          aria-label="Cancelar viaje"
        >
          <X className="w-4 h-4" />
        </Button>
      </motion.div>
    );
  }

  return (
    // Wrapper is non-interactive so it never blocks map drag/zoom/pinch.
    // Only the inner card re-enables pointer events. Anclada solo a la
    // esquina inferior IZQUIERDA (no left-0 right-0) y con ancho acotado —
    // antes ocupaba todo el ancho y tapaba las chapas de parada del lateral
    // derecho (StopConfirmButtons) cuando había varios pasajeros a bordo.
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="fixed bottom-0 left-0 z-40 p-2 pb-4 pointer-events-none"
    >
      <div className="glass-strong rounded-xl overflow-hidden pointer-events-auto w-[64vw] max-w-[250px]">
        {/* Trip Header */}
        <div className="px-2 py-1 bg-primary/20">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-primary">
                <User className="w-2.5 h-2.5 text-primary-foreground" />
              </div>
              <p className="font-semibold text-foreground text-[11px] truncate min-w-0">{data.otherUser}</p>
              <div className="flex items-center gap-0.5 shrink-0">
                <Star className="w-2.5 h-2.5 text-warning fill-warning" />
                <span className="text-[10px] text-muted-foreground">{data.otherUserRating}</span>
              </div>
            </div>

            <div className="flex gap-1 shrink-0">
              <Button variant="glass" size="icon-sm" className="h-6 w-6">
                <MessageCircle className="w-3 h-3" />
              </Button>
              <Button variant="glass" size="icon-sm" className="h-6 w-6">
                <Phone className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Trip Details */}
        <div className="p-1.5 space-y-1">
          {/* Pickup point — la recogida se confirma desde la chapa del
              lateral derecho, no aquí: mostrarla también en esta fila era
              la misma acción por duplicado. */}
          {!hasMoreStops && (
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-success/20 flex items-center justify-center shrink-0">
                <MapPin className="w-2.5 h-2.5 text-success" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground truncate">{data.pickupPoint}</p>
              </div>
            </div>
          )}

          {/* Driver ETA breakdown */}
          {tripStatus === 'waiting' && (
            <div className="flex gap-1 text-[9px]">
              <div className="flex-1 bg-warning/20 rounded-lg p-1 text-center">
                <p className="font-bold text-warning">{pickupEta ?? '?'} min</p>
                <p className="text-muted-foreground leading-tight">hasta recogida</p>
              </div>
              <div className="flex-1 bg-success/20 rounded-lg p-1 text-center">
                <p className="font-bold text-success">{dropoffEta ?? '?'} min</p>
                <p className="text-muted-foreground leading-tight">hasta bajada</p>
              </div>
            </div>
          )}

          {/* Route + Price - Combined */}
          <div className="flex items-center justify-between gap-1 pt-1 border-t border-border/50">
            <div className="flex items-center gap-0.5 text-[9px] min-w-0">
              <span className="text-muted-foreground truncate">{data.origin}</span>
              <Navigation className="w-2.5 h-2.5 text-primary shrink-0" />
              <span className="text-foreground truncate">{data.destination}</span>
            </div>
            <span className="text-xs font-bold shrink-0 text-success">+€{data.price.toFixed(2)}</span>
          </div>

          {/* Actions — el botón de cancelar es solo icono para dejar todo
              el ancho posible a la acción principal en una tarjeta tan
              estrecha. */}
          <div className="flex gap-1 pt-0.5">
            <Button
              variant="destructive"
              size="icon-sm"
              className="h-7 w-7 shrink-0"
              onClick={onClose}
              aria-label="Cancelar"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
            {tripStatus === 'waiting' && !hasMoreStops && (
              <Button variant="driver" size="sm" className="flex-1 h-7 text-[10px] px-1" onClick={onPickup}>
                Pasajero recogido
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default memo(ActiveTripView);
