import { motion } from 'framer-motion';
import { Phone, MessageCircle, MapPin, Clock, Star, Navigation, User } from 'lucide-react';
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
  };
}

const ActiveTripView = ({ isOpen, onClose, userRole, tripStatus = 'waiting', onPickup, isTrackingActive = true, pickupEta, dropoffEta, tripData }: ActiveTripViewProps) => {
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

  return (
    // Wrapper is non-interactive so it never blocks map drag/zoom/pinch.
    // Only the inner card re-enables pointer events.
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="fixed bottom-0 left-0 right-0 z-40 p-3 pb-6 pointer-events-none"
    >
      <div className="glass-strong rounded-xl overflow-hidden max-w-md mx-auto pointer-events-auto">
        {/* Compact Trip Header */}
        <div className={`px-3 py-2 ${userRole === 'driver' ? 'bg-primary/20' : 'bg-secondary/20'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                userRole === 'driver' ? 'bg-primary' : 'bg-secondary'
              }`}>
                <User className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground text-sm">{data.otherUser}</p>
                  <div className="flex items-center gap-0.5">
                    <Star className="w-3 h-3 text-warning fill-warning" />
                    <span className="text-xs text-muted-foreground">{data.otherUserRating}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex gap-1.5">
              <Button variant="glass" size="icon-sm">
                <MessageCircle className="w-4 h-4" />
              </Button>
              <Button variant="glass" size="icon-sm">
                <Phone className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Compact Trip Details */}
        <div className="p-3 space-y-2">
          {/* ETA + Pickup - Combined compact */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-success/20 flex items-center justify-center shrink-0">
              <MapPin className="w-3 h-3 text-success" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">{data.pickupPoint}</p>
            </div>
            <div className="flex items-baseline gap-1 shrink-0">
              <Clock className="w-3 h-3 text-primary" />
              <span className="text-lg font-bold text-foreground">
                {tripStatus === 'picked_up' || tripStatus === 'in_progress'
                  ? dropoffEta ?? data.eta
                  : pickupEta ?? data.eta}
              </span>
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          </div>

          {/* Driver ETA breakdown */}
          {userRole === 'driver' && tripStatus === 'waiting' && (
            <div className="flex gap-2 text-xs">
              <div className="flex-1 bg-warning/20 rounded-lg p-2 text-center">
                <p className="font-bold text-warning">{pickupEta ?? '?'} min</p>
                <p className="text-muted-foreground">hasta recogida</p>
              </div>
              <div className="flex-1 bg-success/20 rounded-lg p-2 text-center">
                <p className="font-bold text-success">{dropoffEta ?? '?'} min</p>
                <p className="text-muted-foreground">hasta bajada</p>
              </div>
            </div>
          )}

          {userRole === 'driver' && tripStatus === 'picked_up' && (
            <div className="bg-success/20 rounded-lg p-2 text-center text-xs">
              <p className="font-bold text-success">{dropoffEta ?? '?'} min</p>
              <p className="text-muted-foreground">hasta bajada del pasajero</p>
            </div>
          )}

          {/* Route + Price - Combined */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">{data.origin}</span>
              <Navigation className="w-3 h-3 text-primary" />
              <span className="text-foreground">{data.destination}</span>
            </div>
            <span className={`font-bold ${userRole === 'driver' ? 'text-success' : 'text-foreground'}`}>
              {userRole === 'driver' ? '+' : ''}€{data.price.toFixed(2)}
            </span>
          </div>

          {/* Actions - Compact */}
          <div className="flex gap-2 pt-1">
            <Button variant="destructive" size="sm" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            {userRole === 'driver' && tripStatus === 'waiting' && (
              <Button variant="driver" size="sm" className="flex-1" onClick={onPickup}>
                Pasajero recogido
              </Button>
            )}
            {tripStatus === 'picked_up' && (
              <Button variant="driver" size="sm" className="flex-1" onClick={onClose}>
                Finalizar
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ActiveTripView;
