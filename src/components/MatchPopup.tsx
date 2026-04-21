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
          {/* Popup floats over the map without dimming it — map stays fully visible & interactive */}
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed left-0 right-0 bottom-0 z-50 max-h-[45vh] overflow-y-auto"
          >
            <div className="glass-strong rounded-t-2xl p-3 shadow-float border-t border-x border-primary/30 max-w-md mx-auto">
              {/* Drag handle */}
              <div className="flex justify-center pt-1 pb-2">
                <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
              </div>

              {/* Header — single compact line */}
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${isDriverView ? 'from-primary to-secondary' : 'from-secondary to-primary'} flex items-center justify-center shrink-0`}>
                  <User className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <h3 className="font-bold text-sm text-foreground truncate">{data.userName}</h3>
                  <div className="flex items-center gap-0.5 text-warning shrink-0">
                    <Star className="w-3 h-3 fill-current" />
                    <span className="text-xs font-medium">{data.rating}</span>
                  </div>
                  <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse shrink-0" />
                </div>
                <Button variant="ghost" size="icon-sm" onClick={onReject}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Badges row */}
              {(data.acceptsPets || data.hasChildSeat || data.doorToDoor) && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {data.acceptsPets && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-primary/20 rounded-full">
                      <PawPrint className="w-3 h-3 text-primary" />
                      <span className="text-[10px] text-primary">+2€</span>
                    </div>
                  )}
                  {data.hasChildSeat && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-secondary/20 rounded-full">
                      <Baby className="w-3 h-3 text-secondary" />
                      <span className="text-[10px] text-secondary">+1€</span>
                    </div>
                  )}
                  {data.doorToDoor && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-success/20 rounded-full">
                      <MapPin className="w-3 h-3 text-success" />
                      <span className="text-[10px] text-success">+{data.doorToDoorSurcharge?.toFixed(2)}€</span>
                    </div>
                  )}
                </div>
              )}

              {/* Stats — compact */}
              <div className="flex gap-1.5 mb-2">
                <div className="flex-1 bg-muted rounded-lg py-1.5 text-center">
                  <p className="text-sm font-bold text-foreground leading-tight">+{data.detourMinutes} min</p>
                  <p className="text-[10px] text-muted-foreground">desvío</p>
                </div>
                <div className="flex-1 bg-muted rounded-lg py-1.5 text-center">
                  <p className="text-sm font-bold text-foreground leading-tight">{data.pickupDistance}</p>
                  <p className="text-[10px] text-muted-foreground">recogida</p>
                </div>
                <div className={`flex-1 ${isDriverView ? 'bg-success/20' : 'bg-secondary/20'} rounded-lg py-1.5 text-center`}>
                  <p className={`text-sm font-bold leading-tight ${isDriverView ? 'text-success' : 'text-secondary'}`}>
                    {isDriverView
                      ? `+${data.compensation.toFixed(2)}€`
                      : `${(data.compensation * (1 + COMMISSION)).toFixed(2)}€`}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {isDriverView ? 'recibes' : 'precio total'}
                  </p>
                </div>
              </div>

              {/* Price breakdown — single line */}
              <div className="mb-2 px-2 py-1 rounded-md bg-muted/40 border border-border/40 flex items-center justify-between text-[10px]">
                {isDriverView ? (
                  <>
                    <span className="text-muted-foreground">Compensación gastos</span>
                    <span className="font-medium text-foreground">{data.compensation.toFixed(2)}€</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Conductor {data.compensation.toFixed(2)}€ · Comisión {(data.compensation * COMMISSION).toFixed(2)}€
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pb-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={onReject}>
                  <X className="w-4 h-4 mr-1" />
                  Rechazar
                </Button>
                <Button
                  variant={isDriverView ? 'driver' : 'passenger'}
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
