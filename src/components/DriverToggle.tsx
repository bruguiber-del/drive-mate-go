import { motion } from 'framer-motion';
import { Car, User } from 'lucide-react';
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
        "relative flex items-center gap-3 px-6 py-3 rounded-full font-semibold transition-all duration-300",
        "border-2",
        isDriver 
          ? "bg-success/20 border-success text-success shadow-lg shadow-success/30" 
          : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
      )}
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
          isDriver ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
        )}
        animate={{ rotate: isDriver ? 0 : 0 }}
      >
        <Car className="w-5 h-5" />
      </motion.div>
      
      <div className="flex flex-col items-start">
        <span className="text-xs uppercase tracking-wider opacity-70">
          Modo conductor
        </span>
        <span className="text-sm font-bold">
          {isDriver ? 'Recogiendo pasajeros' : 'Desactivado'}
        </span>
      </div>

      {/* Pulse indicator when active */}
      {isDriver && (
        <motion.div
          className="absolute -right-1 -top-1 w-4 h-4 bg-success rounded-full"
          animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
    </motion.button>
  );
};

export default DriverToggle;
