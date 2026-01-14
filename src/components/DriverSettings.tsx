import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Timer, MapPin, X, Save, PawPrint, Baby, User, Euro, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DriverSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: DriverSettingsData) => void;
}

export interface DriverSettingsData {
  seats: number;
  maxDetour: number;
  doorToDoor: boolean;
  acceptsPets: boolean;
  hasChildSeat: boolean;
  genderPreference: 'none' | 'women' | 'men';
}

// Fixed surcharges
const PET_SURCHARGE = 2.00;
const CHILD_SEAT_SURCHARGE = 1.00;

const DriverSettings = ({ isOpen, onClose, onSave }: DriverSettingsProps) => {
  const [seats, setSeats] = useState(3);
  const [maxDetour, setMaxDetour] = useState(5);
  const [doorToDoor, setDoorToDoor] = useState(true);
  const [acceptsPets, setAcceptsPets] = useState(false);
  const [hasChildSeat, setHasChildSeat] = useState(false);
  const [genderPreference, setGenderPreference] = useState<'none' | 'women' | 'men'>('none');

  // Calculate estimated door-to-door surcharge based on max detour
  const estimatedDoorToDoorSurcharge = useMemo(() => {
    // Estimate ~2km per 5min detour, ~0.50€ per km extra
    const estimatedExtraKm = (maxDetour / 5) * 2;
    return Math.max(0.50, estimatedExtraKm * 0.50);
  }, [maxDetour]);

  const handleSave = () => {
    onSave({ seats, maxDetour, doorToDoor, acceptsPets, hasChildSeat, genderPreference });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto"
        >
          <div className="glass-strong rounded-t-3xl p-6 pb-8 shadow-float">
            {/* Handle */}
            <div className="flex justify-center mb-4">
              <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">Ajustes de conductor</h2>
              <Button variant="ghost" size="icon-sm" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Seats */}
            <div className="mb-6">
              <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                <Users className="w-4 h-4" />
                Plazas disponibles
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((num) => (
                  <button
                    key={num}
                    onClick={() => setSeats(num)}
                    className={cn(
                      "flex-1 py-3 rounded-xl font-bold transition-all",
                      seats === num 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Max Detour */}
            <div className="mb-6">
              <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                <Timer className="w-4 h-4" />
                Desvío máximo: <span className="text-foreground font-bold">+{maxDetour} min</span>
              </label>
              <input
                type="range"
                min={2}
                max={15}
                value={maxDetour}
                onChange={(e) => setMaxDetour(Number(e.target.value))}
                className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>2 min</span>
                <span>15 min</span>
              </div>
            </div>

            {/* Preferences Section Title */}
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-foreground mb-1">Preferencias</h3>
              <p className="text-sm text-muted-foreground">Configura tus opciones de viaje</p>
            </div>

            {/* Pet Acceptance Toggle */}
            <button
              onClick={() => setAcceptsPets(!acceptsPets)}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded-xl mb-3 transition-all",
                acceptsPets 
                  ? "bg-primary/20 border-2 border-primary" 
                  : "bg-muted border-2 border-transparent"
              )}
            >
              <div className="flex items-center gap-3">
                <PawPrint className={cn("w-5 h-5", acceptsPets ? "text-primary" : "text-muted-foreground")} />
                <div className="text-left">
                  <p className="font-semibold text-foreground">Acepto mascotas</p>
                  <p className="text-sm text-muted-foreground">Recargo automático +{PET_SURCHARGE.toFixed(0)}€</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {acceptsPets && <span className="text-sm font-medium text-success">+{PET_SURCHARGE}€</span>}
                <div className={cn(
                  "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                  acceptsPets ? "border-primary bg-primary" : "border-muted-foreground"
                )}>
                  {acceptsPets && <div className="w-3 h-3 bg-primary-foreground rounded-full" />}
                </div>
              </div>
            </button>

            {/* Child Seat Toggle */}
            <button
              onClick={() => setHasChildSeat(!hasChildSeat)}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded-xl mb-2 transition-all",
                hasChildSeat 
                  ? "bg-secondary/20 border-2 border-secondary" 
                  : "bg-muted border-2 border-transparent"
              )}
            >
              <div className="flex items-center gap-3">
                <Baby className={cn("w-5 h-5", hasChildSeat ? "text-secondary" : "text-muted-foreground")} />
                <div className="text-left">
                  <p className="font-semibold text-foreground">Sistema de retención infantil</p>
                  <p className="text-sm text-muted-foreground">Recargo automático +{CHILD_SEAT_SURCHARGE.toFixed(0)}€</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasChildSeat && <span className="text-sm font-medium text-success">+{CHILD_SEAT_SURCHARGE}€</span>}
                <div className={cn(
                  "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                  hasChildSeat ? "border-secondary bg-secondary" : "border-muted-foreground"
                )}>
                  {hasChildSeat && <div className="w-3 h-3 bg-secondary-foreground rounded-full" />}
                </div>
              </div>
            </button>

            {/* Child Seat Disclaimer */}
            {hasChildSeat && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-xs text-muted-foreground mb-3 px-2"
              >
                ⚠️ El conductor es responsable del cumplimiento normativo y del uso correcto del sistema de retención infantil.
              </motion.p>
            )}

            {/* Door to Door */}
            <button
              onClick={() => setDoorToDoor(!doorToDoor)}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded-xl mb-3 transition-all",
                doorToDoor 
                  ? "bg-success/20 border-2 border-success" 
                  : "bg-muted border-2 border-transparent"
              )}
            >
              <div className="flex items-center gap-3">
                <MapPin className={cn("w-5 h-5", doorToDoor ? "text-success" : "text-muted-foreground")} />
                <div className="text-left">
                  <p className="font-semibold text-foreground">Puerta a puerta</p>
                  <p className="text-sm text-muted-foreground">Recogida en origen del pasajero</p>
                </div>
              </div>
              <div className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                doorToDoor ? "border-success bg-success" : "border-muted-foreground"
              )}>
                {doorToDoor && <div className="w-3 h-3 bg-success-foreground rounded-full" />}
              </div>
            </button>

            {/* Door to Door Info */}
            {doorToDoor && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 p-3 bg-muted/50 rounded-xl"
              >
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      El recargo puerta a puerta se calcula automáticamente según los km extra y tiempo de desvío.
                    </p>
                    <p className="text-sm font-medium text-foreground mt-1">
                      Estimado actual: +{estimatedDoorToDoorSurcharge.toFixed(2)}€
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Gender Preference */}
            <div className="mb-4">
              <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                <User className="w-4 h-4" />
                Preferencia de recogida
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'none', label: 'Indiferente' },
                  { value: 'women', label: 'Solo mujeres' },
                  { value: 'men', label: 'Solo hombres' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setGenderPreference(option.value as 'none' | 'women' | 'men')}
                    className={cn(
                      "flex-1 py-3 px-2 rounded-xl text-sm font-medium transition-all",
                      genderPreference === option.value 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2 px-1">
                Esta preferencia filtra coincidencias pero no es obligatoria.
              </p>
            </div>

            {/* Estimated compensation */}
            <div className="bg-gradient-to-r from-success/20 to-primary/20 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Euro className="w-4 h-4 text-success" />
                <p className="text-sm text-muted-foreground">Compensación estimada por compartir gastos hoy</p>
              </div>
              <p className="text-2xl font-bold text-foreground">4 - 8€ <span className="text-sm font-normal text-muted-foreground">por persona</span></p>
              <p className="text-xs text-muted-foreground mt-1">Después de la comisión del 15% de la app</p>
            </div>

            {/* Save Button */}
            <Button 
              variant="driver" 
              size="xl" 
              className="w-full"
              onClick={handleSave}
            >
              <Save className="w-5 h-5" />
              Guardar ajustes
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DriverSettings;
