import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PassengerToggleProps {
  isPassenger: boolean;
  onToggle: () => void;
}

/** Same orange used for the "Parada 1 — Recogida" map marker */
const ORANGE = 'hsl(24, 95%, 53%)';

const PassengerToggle = ({ isPassenger, onToggle }: PassengerToggleProps) => {
  return (
    <motion.button
      onClick={onToggle}
      className={cn(
        "relative flex items-center gap-2 px-3 py-2 rounded-full font-semibold transition-all duration-300",
        "border-2",
        !isPassenger && "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
      )}
      style={
        isPassenger
          ? {
              backgroundColor: 'hsl(24, 95%, 53%, 0.2)',
              borderColor: ORANGE,
              color: ORANGE,
              boxShadow: '0 10px 15px -3px hsl(24, 95%, 53%, 0.3)',
            }
          : undefined
      }
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
          !isPassenger && "bg-muted text-muted-foreground"
        )}
        style={isPassenger ? { backgroundColor: ORANGE, color: '#fff' } : undefined}
      >
        <Users className="w-4 h-4" />
      </motion.div>

      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-wider opacity-70">
          Pasajero
        </span>
        <span className="text-xs font-bold">
          {isPassenger ? 'Buscando...' : 'Off'}
        </span>
      </div>

      {/* Pulse indicator when active */}
      {isPassenger && (
        <motion.div
          className="absolute -right-0.5 -top-0.5 w-3 h-3 rounded-full"
          style={{ backgroundColor: ORANGE }}
          animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
    </motion.button>
  );
};

export default PassengerToggle;
