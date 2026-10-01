import { memo } from 'react';
import { motion } from 'framer-motion';
import { Phone, MessageCircle, MapPin, Clock, Star, Navigation, User, Car, Footprints, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActiveTripViewProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: 'driver' | 'passenger';
  tripStatus?: 'waiting' | 'picked_up' | 'in_progress';
  onPickup?: () => void;
  isTrackingActive?: boolean;
  /** Minutes until reaching the passenger pickup point */
  pickupEta?: number;
  /** Minutes until dropping the passenger at their destination */
  dropoffEta?: number;
  /** Passenger view — driver's vehicle */
  driverVehicle?: { brand: string; model: string; color?: string; licensePlate: string };
  /** Passenger view — minutes until the driver arrives at the meeting point */
  driverEta?: number;
  /** Passenger view — walking minutes to the meeting point */
  walkingMinutes?: number;
  /** Passenger view — called when confirming the driver has arrived */
  onDriverArrived?: () => void;
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
    acceptsPets?: boolean;
    hasChildSeat?: boolean;
    /** Km que quedan hasta el destino — solo se usa en la tarjeta mínima del
     *  conductor sin pasajeros ya a bordo/pendientes. */
    distanceKm?: string;
  };
}

const ActiveTripView = ({ isOpen, onClose, userRole, tripStatus = 'waiting', onPickup, isTrackingActive = true, pickupEta, dropoffEta, driverVehicle, driverEta, walkingMinutes, onDriverArrived, hasMoreStops = false, tripData }: ActiveTripViewProps) => {
  const defaultData = {
    otherUser: userRole === 'driver' ? 'Ana M.' : 'Carlos G.',
    otherUserRating: 4.8,
    origin: 'Huesca',
    destination: 'Zaragoza',
    pickupPoint: 'Estación de autobuses, Huesca',
    eta: 5,
    price: 6.50,
    acceptsPets: true,
    hasChildSeat: true,
  };

  const data = tripData || defaultData;

  if (!isOpen) return null;

  // Conductor con paradas pendientes: toda la información (nombre, ETA de
  // recogida/bajada) ya vive en las chapas de StopConfirmButtons, una por
  // pasajero — repetirla aquí en una tarjeta grande era exactamente la
  // misma información dos veces. Se queda solo un botón mínimo para poder
  // cancelar el viaje entero.
  if (userRole === 'driver' && hasMoreStops) {
    return (
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.7, opacity: 0 }}
        className="fixed bottom-3 left-3 z-40"
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

  // Conductor sin pasajeros ya a bordo/pendientes (todos bajados, o nunca
  // hubo ninguno): nada de avatar/estrellas/punto de recogida tiene sentido
  // aquí, solo cuánto queda para llegar — antes se reutilizaba la tarjeta
  // completa de pasajero y salía "★0" y "? min hasta bajada del pasajero"
  // (un dato que ya no existe, porque no hay a quién bajar).
  if (userRole === 'driver' && tripStatus === 'picked_up' && !hasMoreStops) {
    return (
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className="fixed bottom-3 left-3 z-40 pointer-events-none"
      >
        <div className="glass-strong rounded-xl overflow-hidden pointer-events-auto flex items-center gap-2 px-2.5 py-2">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <Navigation className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            {data.distanceKm ? (
              <>
                <p className="text-sm font-bold text-foreground leading-tight whitespace-nowrap">
                  {data.eta} min · {data.distanceKm} km
                </p>
                <p className="text-[9px] text-muted-foreground leading-tight">hasta destino</p>
              </>
            ) : (
              <p className="text-sm font-bold text-success leading-tight whitespace-nowrap">¡Has llegado!</p>
            )}
          </div>
          <Button
            variant="driver"
            size="sm"
            className="h-7 text-[10px] px-2 ml-1 shrink-0"
            onClick={onClose}
          >
            Finalizar
          </Button>
        </div>
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
        <div className={`px-2 py-1 ${userRole === 'driver' ? 'bg-primary/20' : 'bg-secondary/20'}`}>
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                userRole === 'driver' ? 'bg-primary' : 'bg-secondary'
              }`}>
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
          {/* Pickup point — sin la cuenta atrás grande cuando el conductor
              ya tiene su propio desglose "hasta recogida/hasta bajada" justo
              debajo (si no, salía el mismo número dos veces). Para el
              conductor con paradas pendientes, la recogida se confirma
              desde la chapa del lateral derecho, no aquí — mostrarla
              también en esta fila era la misma acción por duplicado. */}
          {!(userRole === 'driver' && hasMoreStops) && (
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-success/20 flex items-center justify-center shrink-0">
                <MapPin className="w-2.5 h-2.5 text-success" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground truncate">{data.pickupPoint}</p>
              </div>
              {userRole === 'passenger' && (
                <div className="flex items-baseline gap-0.5 shrink-0">
                  <Clock className="w-2.5 h-2.5 text-primary" />
                  <span className="text-sm font-bold text-foreground">
                    {tripStatus === 'picked_up' || tripStatus === 'in_progress'
                      ? dropoffEta ?? data.eta
                      : pickupEta ?? data.eta}
                  </span>
                  <span className="text-[9px] text-muted-foreground">min</span>
                </div>
              )}
            </div>
          )}

          {/* Passenger — vehicle identification */}
          {userRole === 'passenger' && driverVehicle && (
            <div className="flex items-center gap-1.5 rounded-lg border border-secondary/30 bg-secondary/10 p-1.5">
              <Car className="w-3 h-3 text-secondary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold text-foreground truncate">
                  {driverVehicle.brand} {driverVehicle.model}
                  {driverVehicle.color ? ` · ${driverVehicle.color}` : ''}
                </p>
                <p className="text-[8px] text-muted-foreground">Busca esta matrícula</p>
              </div>
              <span className="shrink-0 rounded border border-foreground/40 bg-background px-1.5 py-0.5 font-mono text-[10px] font-extrabold tracking-wider text-foreground">
                {driverVehicle.licensePlate}
              </span>
            </div>
          )}

          {/* Passenger — status */}
          {userRole === 'passenger' && tripStatus === 'waiting' && (
            <div className="flex gap-1 text-[9px]">
              <div className="flex-1 bg-secondary/20 rounded-lg p-1 text-center">
                <p className="font-bold text-secondary">{driverEta ?? data.eta} min</p>
                <p className="text-muted-foreground leading-tight">llega tu conductor</p>
              </div>
              {walkingMinutes != null && (
                <div className="flex-1 rounded-lg p-1 text-center bg-muted flex flex-col items-center">
                  <p className="font-bold text-foreground flex items-center gap-0.5">
                    <Footprints className="w-2.5 h-2.5" /> {walkingMinutes} min
                  </p>
                  <p className="text-muted-foreground leading-tight">al punto de encuentro</p>
                </div>
              )}
            </div>
          )}

          {userRole === 'passenger' && (tripStatus === 'picked_up' || tripStatus === 'in_progress') && (
            <div className="rounded-lg bg-success/20 p-1 text-center text-[10px]">
              <p className="font-bold text-success">En camino a tu destino</p>
              <p className="text-muted-foreground leading-tight">
                {dropoffEta ?? data.eta} min hasta {data.destination}
              </p>
            </div>
          )}

          {/* Driver ETA breakdown */}
          {userRole === 'driver' && tripStatus === 'waiting' && (
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

          {userRole === 'driver' && tripStatus === 'picked_up' && (
            <div className="bg-success/20 rounded-lg p-1 text-center text-[9px]">
              <p className="font-bold text-success">{dropoffEta ?? '?'} min</p>
              <p className="text-muted-foreground leading-tight">hasta bajada del pasajero</p>
            </div>
          )}

          {/* Route + Price - Combined */}
          <div className="flex items-center justify-between gap-1 pt-1 border-t border-border/50">
            <div className="flex items-center gap-0.5 text-[9px] min-w-0">
              <span className="text-muted-foreground truncate">{data.origin}</span>
              <Navigation className="w-2.5 h-2.5 text-primary shrink-0" />
              <span className="text-foreground truncate">{data.destination}</span>
            </div>
            <span className={`text-xs font-bold shrink-0 ${userRole === 'driver' ? 'text-success' : 'text-foreground'}`}>
              {userRole === 'driver' ? '+' : ''}€{data.price.toFixed(2)}
            </span>
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
            {userRole === 'driver' && tripStatus === 'waiting' && !hasMoreStops && (
              <Button variant="driver" size="sm" className="flex-1 h-7 text-[10px] px-1" onClick={onPickup}>
                Pasajero recogido
              </Button>
            )}
            {userRole === 'passenger' && tripStatus === 'waiting' && (
              <Button variant="passenger" size="sm" className="flex-1 h-7 text-[10px] px-1" onClick={onDriverArrived ?? onPickup}>
                Conductor llegado
              </Button>
            )}
            {tripStatus === 'picked_up' && !(userRole === 'driver' && hasMoreStops) && (
              <Button variant="driver" size="sm" className="flex-1 h-7 text-[10px] px-1" onClick={onClose}>
                Finalizar
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default memo(ActiveTripView);
