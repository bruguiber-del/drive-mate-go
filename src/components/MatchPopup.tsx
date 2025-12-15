import { motion, AnimatePresence } from 'framer-motion';
import { User, Clock, Route, Euro, X, Check, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MatchPopupProps {
  isOpen: boolean;
  onAccept: () => void;
  onReject: () => void;
  matchData?: {
    passengerName: string;
    rating: number;
    detourMinutes: number;
    earnings: number;
    pickupDistance: string;
  };
}

const MatchPopup = ({ isOpen, onAccept, onReject, matchData }: MatchPopupProps) => {
  const defaultData = {
    passengerName: 'María G.',
    rating: 4.8,
    detourMinutes: 3,
    earnings: 4.50,
    pickupDistance: '200m'
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
                  <span className="text-sm font-medium text-success">Pasajero compatible</span>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={onReject}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Passenger Info */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <User className="w-7 h-7 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">{data.passengerName}</h3>
                  <div className="flex items-center gap-1 text-warning">
                    <Star className="w-4 h-4 fill-current" />
                    <span className="text-sm font-medium">{data.rating}</span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-muted rounded-xl p-3 text-center">
                  <Clock className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">+{data.detourMinutes}</p>
                  <p className="text-xs text-muted-foreground">minutos</p>
                </div>
                <div className="bg-muted rounded-xl p-3 text-center">
                  <Route className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{data.pickupDistance}</p>
                  <p className="text-xs text-muted-foreground">recogida</p>
                </div>
                <div className="bg-success/20 rounded-xl p-3 text-center border border-success/30">
                  <Euro className="w-5 h-5 text-success mx-auto mb-1" />
                  <p className="text-lg font-bold text-success">+{data.earnings.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">ingresos</p>
                </div>
              </div>

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
                  variant="driver" 
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
