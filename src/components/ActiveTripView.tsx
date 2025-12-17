import { motion } from 'framer-motion';
import { Phone, MessageCircle, X, MapPin, Clock, Star, Navigation, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActiveTripViewProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: 'driver' | 'passenger';
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

const ActiveTripView = ({ isOpen, onClose, userRole, tripData }: ActiveTripViewProps) => {
  const defaultData = {
    otherUser: userRole === 'driver' ? 'Ana M.' : 'Carlos G.',
    otherUserRating: 4.8,
    origin: 'Huesca',
    destination: 'Zaragoza',
    pickupPoint: 'Estación de autobuses, Huesca',
    eta: 5,
    price: 6.50,
  };

  const data = tripData || defaultData;

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ y: 200, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 200, opacity: 0 }}
      className="fixed bottom-0 left-0 right-0 z-40 p-4 pb-8"
    >
      <div className="glass-strong rounded-2xl overflow-hidden">
        {/* Trip Status Header */}
        <div className={`p-4 ${userRole === 'driver' ? 'bg-primary/20' : 'bg-secondary/20'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                userRole === 'driver' ? 'bg-primary' : 'bg-secondary'
              }`}>
                <User className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <p className="font-bold text-foreground">{data.otherUser}</p>
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-warning fill-warning" />
                  <span className="text-sm text-muted-foreground">{data.otherUserRating}</span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button variant="glass" size="icon">
                <MessageCircle className="w-5 h-5" />
              </Button>
              <Button variant="glass" size="icon">
                <Phone className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Trip Details */}
        <div className="p-4 space-y-4">
          {/* ETA */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              <span className="text-muted-foreground">
                {userRole === 'passenger' ? 'Tu conductor llega en' : 'Llegada al punto de recogida'}
              </span>
            </div>
            <span className="text-2xl font-bold text-foreground">{data.eta} min</span>
          </div>

          {/* Pickup Point */}
          <div className="glass rounded-xl p-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-success/20 flex items-center justify-center mt-1">
                <MapPin className="w-4 h-4 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Punto de recogida</p>
                <p className="font-medium text-foreground">{data.pickupPoint}</p>
              </div>
            </div>
          </div>

          {/* Route Summary */}
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{data.origin}</span>
            <div className="flex-1 h-px bg-border relative">
              <Navigation className="w-4 h-4 text-primary absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card" />
            </div>
            <span className="text-muted-foreground">{data.destination}</span>
          </div>

          {/* Price */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-muted-foreground">
              {userRole === 'driver' ? 'Ganarás' : 'Coste del viaje'}
            </span>
            <span className={`text-xl font-bold ${userRole === 'driver' ? 'text-success' : 'text-foreground'}`}>
              {userRole === 'driver' ? '+' : ''}€{data.price.toFixed(2)}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="destructive" className="flex-1" onClick={onClose}>
              Cancelar viaje
            </Button>
            {userRole === 'driver' && (
              <Button variant="driver" className="flex-1">
                He recogido
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ActiveTripView;
