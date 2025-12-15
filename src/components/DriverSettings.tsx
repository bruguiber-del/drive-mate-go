import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Timer, MapPin, Wallet, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DriverSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: DriverSettingsData) => void;
}

interface DriverSettingsData {
  seats: number;
  maxDetour: number;
  doorToDoor: boolean;
  doorToDoorFee: number;
}

const DriverSettings = ({ isOpen, onClose, onSave }: DriverSettingsProps) => {
  const [seats, setSeats] = useState(3);
  const [maxDetour, setMaxDetour] = useState(5);
  const [doorToDoor, setDoorToDoor] = useState(true);
  const [doorToDoorFee, setDoorToDoorFee] = useState(2);

  const handleSave = () => {
    onSave({ seats, maxDetour, doorToDoor, doorToDoorFee });
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
          className="fixed inset-x-0 bottom-0 z-50"
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

            {/* Door to Door */}
            <button
              onClick={() => setDoorToDoor(!doorToDoor)}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded-xl mb-4 transition-all",
                doorToDoor 
                  ? "bg-success/20 border-2 border-success" 
                  : "bg-muted border-2 border-transparent"
              )}
            >
              <div className="flex items-center gap-3">
                <MapPin className={cn("w-5 h-5", doorToDoor ? "text-success" : "text-muted-foreground")} />
                <div className="text-left">
                  <p className="font-semibold text-foreground">Puerta a puerta</p>
                  <p className="text-sm text-muted-foreground">Ofrecer recogida en origen</p>
                </div>
              </div>
              <div className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                doorToDoor ? "border-success bg-success" : "border-muted-foreground"
              )}>
                {doorToDoor && <div className="w-3 h-3 bg-success-foreground rounded-full" />}
              </div>
            </button>

            {/* Door to Door Fee */}
            {doorToDoor && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6"
              >
                <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                  <Wallet className="w-4 h-4" />
                  Recargo puerta a puerta
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={0.5}
                    value={doorToDoorFee}
                    onChange={(e) => setDoorToDoorFee(Number(e.target.value))}
                    className="flex-1 h-2 bg-muted rounded-full appearance-none cursor-pointer accent-success"
                  />
                  <span className="text-lg font-bold text-foreground w-16 text-right">+{doorToDoorFee}€</span>
                </div>
              </motion.div>
            )}

            {/* Estimated earnings */}
            <div className="bg-gradient-to-r from-success/20 to-primary/20 rounded-xl p-4 mb-6">
              <p className="text-sm text-muted-foreground mb-1">Ingresos estimados hoy</p>
              <p className="text-2xl font-bold text-foreground">12 - 25€</p>
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
