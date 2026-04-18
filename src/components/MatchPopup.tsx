import { motion, AnimatePresence } from 'framer-motion';
import { User, X, Check, Star, PawPrint, Baby, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COMMISSION } from '@/lib/priceCalculator';

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

          {/* Popup - Compact version */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 30 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="fixed left-4 right-4 bottom-24 z-50 max-w-sm mx-auto"
          >
            <div className="glass-strong rounded-2xl p-4 shadow-float border border-primary/30">
              {/* Header + User Info - Combined compact */}
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${isDriverView ? 'from-primary to-secondary' : 'from-secondary to-primary'} flex items-center justify-center shrink-0`}>
                  <User className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-foreground">{data.userName}</h3>
                    <div className="flex items-center gap-0.5 text-warning">
                      <Star className="w-3 h-3 fill-current" />
                      <span className="text-xs font-medium">{data.rating}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
                    <span className="text-xs text-success">
                      {isDriverView ? 'Pasajero compatible' : 'Conductor disponible'}
                    </span>
                  </div>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={onReject}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Features Badges - Compact */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {data.acceptsPets && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-primary/20 rounded-full">
                    <PawPrint className="w-3 h-3 text-primary" />
                    <span className="text-xs text-primary">+2€</span>
                  </div>
                )}
                {data.hasChildSeat && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-secondary/20 rounded-full">
                    <Baby className="w-3 h-3 text-secondary" />
                    <span className="text-xs text-secondary">+1€</span>
                  </div>
                )}
                {data.doorToDoor && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-success/20 rounded-full">
                    <MapPin className="w-3 h-3 text-success" />
                    <span className="text-xs text-success">+{data.doorToDoorSurcharge?.toFixed(2)}€</span>
                  </div>
                )}
              </div>

              {/* Stats - Compact */}
              <div className="flex gap-2 mb-2">
                <div className="flex-1 bg-muted rounded-lg p-2 text-center">
                  <p className="text-sm font-bold text-foreground">+{data.detourMinutes} min</p>
                  <p className="text-xs text-muted-foreground">desvío</p>
                </div>
                <div className="flex-1 bg-muted rounded-lg p-2 text-center">
                  <p className="text-sm font-bold text-foreground">{data.pickupDistance}</p>
                  <p className="text-xs text-muted-foreground">recogida</p>
                </div>
                <div className={`flex-1 ${isDriverView ? 'bg-success/20' : 'bg-secondary/20'} rounded-lg p-2 text-center`}>
                  <p className={`text-sm font-bold ${isDriverView ? 'text-success' : 'text-secondary'}`}>
                    {isDriverView
                      ? `+${data.compensation.toFixed(2)}€`
                      : `${(data.compensation * (1 + COMMISSION)).toFixed(2)}€`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isDriverView ? 'recibes' : 'precio total'}
                  </p>
                </div>
              </div>

              {/* Price breakdown — cost-sharing transparency */}
              <div className="mb-3 px-2 py-1.5 rounded-lg bg-muted/40 border border-border/40">
                {isDriverView ? (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Compensación por compartir gastos</span>
                    <span className="font-medium text-foreground">{data.compensation.toFixed(2)}€</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Compartido con conductor</span>
                      <span className="font-medium text-foreground">{data.compensation.toFixed(2)}€</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] mt-0.5">
                      <span className="text-muted-foreground">Comisión VIMATCH ({Math.round(COMMISSION * 100)}%)</span>
                      <span className="font-medium text-foreground">
                        {(data.compensation * COMMISSION).toFixed(2)}€
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Actions - Compact */}
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={onReject}
                >
                  <X className="w-4 h-4 mr-1" />
                  Rechazar
                </Button>
                <Button 
                  variant={isDriverView ? "driver" : "passenger"}
                  size="sm" 
                  className="flex-1"
                  onClick={onAccept}
                >
                  <Check className="w-4 h-4 mr-1" />
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
