import { motion, AnimatePresence } from 'framer-motion';
import { User, Clock, Route, Euro, X, Check, Star, PawPrint, Baby, MapPin, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MatchPopupProps {
  isOpen: boolean;
  onAccept: () => void;
  onReject: () => void;
  isDriverView?: boolean; // true = driver viewing passenger, false = passenger viewing driver
  matchData?: {
    userName: string;
    rating: number;
    detourMinutes: number;
    compensation: number; // For driver: earnings, for passenger: trip price
    pickupDistance: string;
    acceptsPets?: boolean;
    hasChildSeat?: boolean;
    doorToDoor?: boolean;
    doorToDoorSurcharge?: number;
    tripPrice?: number; // Auto-calculated price
    origin?: string;
    destination?: string;
  };
}

const MatchPopup = ({ isOpen, onAccept, onReject, isDriverView = true, matchData }: MatchPopupProps) => {
  const defaultData = {
    userName: isDriverView ? 'María G.' : 'Carlos G.',
    rating: 4.8,
    detourMinutes: 3,
    compensation: isDriverView ? 4.50 : 6.50,
    pickupDistance: '200m',
    acceptsPets: true,
    hasChildSeat: false,
    doorToDoor: true,
    doorToDoorSurcharge: 1.20,
    tripPrice: 6.50,
    origin: 'Huesca',
    destination: 'Zaragoza',
  };

  const data = matchData || defaultData;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
            onClick={onReject}
          />

          {/* Popup */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 50 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed left-4 right-4 top-1/2 -translate-y-1/2 z-50 max-w-md mx-auto"
          >
            <div className="glass-strong rounded-3xl p-6 shadow-float border border-primary/30">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-success">
                    {isDriverView ? 'Pasajero compatible' : 'Conductor disponible'}
                  </span>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={onReject}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* User Info */}
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${isDriverView ? 'from-primary to-secondary' : 'from-secondary to-primary'} flex items-center justify-center`}>
                  <User className="w-7 h-7 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">{data.userName}</h3>
                  <div className="flex items-center gap-1 text-warning">
                    <Star className="w-4 h-4 fill-current" />
                    <span className="text-sm font-medium">{data.rating}</span>
                  </div>
                </div>
              </div>

              {/* Route Info - For passenger view */}
              {!isDriverView && data.origin && data.destination && (
                <div className="flex items-center gap-2 mb-4 p-3 bg-muted rounded-xl">
                  <MapPin className="w-4 h-4 text-success" />
                  <span className="text-sm text-muted-foreground">{data.origin}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-sm text-foreground font-medium">{data.destination}</span>
                </div>
              )}

              {/* Features Badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                {data.acceptsPets && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 rounded-full">
                    <PawPrint className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium text-primary">Acepta mascotas +2€</span>
                  </div>
                )}
                {data.hasChildSeat && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary/20 rounded-full">
                    <Baby className="w-4 h-4 text-secondary" />
                    <span className="text-xs font-medium text-secondary">Silla infantil +1€</span>
                  </div>
                )}
                {data.doorToDoor && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-success/20 rounded-full">
                    <MapPin className="w-4 h-4 text-success" />
                    <span className="text-xs font-medium text-success">Puerta a puerta +{data.doorToDoorSurcharge?.toFixed(2)}€</span>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-muted rounded-xl p-3 text-center">
                  <Clock className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">+{data.detourMinutes}</p>
                  <p className="text-xs text-muted-foreground">min desvío</p>
                </div>
                <div className="bg-muted rounded-xl p-3 text-center">
                  <Route className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{data.pickupDistance}</p>
                  <p className="text-xs text-muted-foreground">recogida</p>
                </div>
                <div className={`${isDriverView ? 'bg-success/20 border-success/30' : 'bg-secondary/20 border-secondary/30'} rounded-xl p-3 text-center border`}>
                  <Euro className={`w-5 h-5 ${isDriverView ? 'text-success' : 'text-secondary'} mx-auto mb-1`} />
                  <p className={`text-lg font-bold ${isDriverView ? 'text-success' : 'text-secondary'}`}>
                    {isDriverView ? '+' : ''}{data.compensation.toFixed(2)}€
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isDriverView ? 'compensación' : 'precio'}
                  </p>
                </div>
              </div>

              {/* Price calculated automatically notice - For passenger */}
              {!isDriverView && (
                <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-xl mb-4">
                  <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    El precio se calcula automáticamente según distancia, combustible y recargos. No se permiten modificaciones.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="flex-1"
                  onClick={onReject}
                >
                  <X className="w-5 h-5" />
                  Rechazar
                </Button>
                <Button 
                  variant={isDriverView ? "driver" : "passenger"}
                  size="lg" 
                  className="flex-1"
                  onClick={onAccept}
                >
                  <Check className="w-5 h-5" />
                  Aceptar
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MatchPopup;
