import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, X, Check, Star, PawPrint, Baby, MapPin, Car, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COMMISSION, PET_SURCHARGE, CHILD_SEAT_SURCHARGE } from '@/lib/priceCalculator';

export interface MatchData {
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
    /** Passenger view only — driver's vehicle info */
    vehicle?: { brand: string; model: string; color?: string; licensePlate: string };
    /** Passenger view only — minutes until the driver arrives */
    etaMinutes?: number;
    /** Passenger view only — price breakdown */
    basePrice?: number;
    commissionAmount?: number;
    totalPrice?: number;
}

interface MatchPopupProps {
  isOpen: boolean;
  onAccept: () => void;
  onReject: () => void;
  isDriverView?: boolean; // true = driver viewing passenger, false = passenger viewing driver
  matchData?: MatchData;
}

const MatchPopup = ({ isOpen, onAccept, onReject, isDriverView = true, matchData }: MatchPopupProps) => {
  const defaultData: MatchData = {
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
            className="fixed left-0 right-0 bottom-0 z-50 max-h-[38vh] overflow-y-auto"
          >
            <div className="glass-strong rounded-t-2xl px-2.5 py-2 shadow-float border-t border-x border-primary/30 max-w-md mx-auto">
              {/* Drag handle */}
              <div className="flex justify-center pb-1.5">
                <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
              </div>

              {/* Header — single compact line */}
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${isDriverView ? 'from-primary to-secondary' : 'from-secondary to-primary'} flex items-center justify-center shrink-0`}>
                  <User className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <h3 className="font-bold text-xs text-foreground truncate">{data.userName}</h3>
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
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {data.acceptsPets && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-primary/20 rounded-full">
                      <PawPrint className="w-3 h-3 text-primary" />
                      <span className="text-[10px] text-primary">+{PET_SURCHARGE.toFixed(0)}€</span>
                    </div>
                  )}
                  {data.hasChildSeat && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-secondary/20 rounded-full">
                      <Baby className="w-3 h-3 text-secondary" />
                      <span className="text-[10px] text-secondary">+{CHILD_SEAT_SURCHARGE.toFixed(0)}€</span>
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

              {/* Vehicle info — SOLO vista pasajero (identificación del coche) */}
              {!isDriverView && data.vehicle && (
                <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-secondary/30 bg-secondary/10 px-2 py-1">
                  <Car className="w-3.5 h-3.5 text-secondary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-foreground truncate">
                      {data.vehicle.brand} {data.vehicle.model}
                      {data.vehicle.color ? ` · ${data.vehicle.color}` : ''}
                    </p>
                    <p className="text-[9px] text-muted-foreground">Identifica el vehículo por su matrícula</p>
                  </div>
                  <span className="shrink-0 rounded-md border border-foreground/30 bg-background px-1.5 py-0.5 font-mono text-xs font-bold tracking-wider text-foreground">
                    {data.vehicle.licensePlate}
                  </span>
                </div>
              )}

              {/* Stats — compact */}
              <div className="flex gap-1 mb-1.5">
                <div className="flex-1 bg-muted rounded-md py-1 text-center">
                  {isDriverView ? (
                    <>
                      <p className="text-xs font-bold text-foreground leading-tight">+{data.detourMinutes} min</p>
                      <p className="text-[9px] text-muted-foreground leading-tight">desvío</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-bold text-foreground leading-tight flex items-center justify-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-secondary" />
                        {data.etaMinutes ?? data.detourMinutes} min
                      </p>
                      <p className="text-[9px] text-muted-foreground leading-tight">llega en</p>
                    </>
                  )}
                </div>
                <div className="flex-1 bg-muted rounded-md py-1 text-center">
                  <p className="text-xs font-bold text-foreground leading-tight">{data.pickupDistance}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">recogida</p>
                </div>
                <div className={`flex-1 ${isDriverView ? 'bg-success/20' : 'bg-secondary/20'} rounded-md py-1 text-center`}>
                  <p className={`text-xs font-bold leading-tight ${isDriverView ? 'text-success' : 'text-secondary'}`}>
                    {isDriverView
                      ? `+${data.compensation.toFixed(2)}€`
                      : `${(data.totalPrice ?? data.compensation * (1 + COMMISSION)).toFixed(2)}€`}
                  </p>
                  <p className="text-[9px] text-muted-foreground leading-tight">
                    {isDriverView ? 'recibes' : 'precio total'}
                  </p>
                </div>
              </div>

              {/* Price breakdown */}
              {isDriverView ? (
                <div className="mb-1.5 px-2 py-0.5 rounded-md bg-muted/40 border border-border/40 flex items-center justify-between text-[9px]">
                  <span className="text-muted-foreground">Compensación gastos</span>
                  <span className="font-medium text-foreground">{data.compensation.toFixed(2)}€</span>
                </div>
              ) : (
                <div className="mb-1.5 px-2 py-1 rounded-md bg-muted/40 border border-border/40 space-y-0 text-[10px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Coste base del trayecto</span>
                    <span className="text-foreground">
                      {(data.basePrice ?? data.compensation).toFixed(2)}€
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Comisión VIMATCH (12%)</span>
                    <span className="text-foreground">
                      {(data.commissionAmount ?? data.compensation * COMMISSION).toFixed(2)}€
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/40 pt-0.5 font-bold">
                    <span className="text-foreground">Total a pagar</span>
                    <span className="text-secondary">
                      {(data.totalPrice ?? data.compensation * (1 + COMMISSION)).toFixed(2)}€
                    </span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pb-0.5">
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={onReject}>
                  <X className="w-3.5 h-3.5 mr-1" />
                  Rechazar
                </Button>
                <Button
                  variant={isDriverView ? 'driver' : 'passenger'}
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={onAccept}
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
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

export default memo(MatchPopup);
