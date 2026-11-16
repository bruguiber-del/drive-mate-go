import { motion } from 'framer-motion';
import { Car } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DriverToggleProps {
  isDriver: boolean;
  onToggle: () => void;
}

const DriverToggle = ({ isDriver, onToggle }: DriverToggleProps) => {
  return (
    <motion.button
      onClick={onToggle}
      className={cn(
        "relative flex items-center gap-2 px-3 py-2 rounded-full font-semibold transition-all duration-300",
        "border-2",
        isDriver 
          ? "bg-success/20 border-success text-success shadow-lg shadow-success/30" 
          : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
      )}
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
          isDriver ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        <Car className="w-4 h-4" />
      </motion.div>
      
      {/* Sin la palabra "Conductor" — el propio icono del coche ya dice de
          qué modo se trata, a petición del usuario. Solo queda el estado. */}
      <span className="text-xs font-bold pr-0.5">
        {isDriver ? 'Activo' : 'Off'}
      </span>

      {/* Pulse indicator when active */}
      {isDriver && (
        <motion.div
          className="absolute -right-0.5 -top-0.5 w-3 h-3 bg-success rounded-full"
          animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
    </motion.button>
  );
};

export default DriverToggle;
