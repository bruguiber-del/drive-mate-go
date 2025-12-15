import { motion } from 'framer-motion';
import { Users, Clock, Euro, ChevronRight } from 'lucide-react';

interface PassengerCardProps {
  onClick: () => void;
  hasActiveSearch?: boolean;
}

const PassengerCard = ({ onClick, hasActiveSearch }: PassengerCardProps) => {
  return (
    <motion.button
      onClick={onClick}
      className="w-full glass rounded-2xl p-4 text-left group overflow-hidden relative"
      whileTap={{ scale: 0.98 }}
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-secondary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0">
          <Users className="w-6 h-6 text-secondary-foreground" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-foreground">Buscar conductores</p>
            {hasActiveSearch && (
              <span className="px-2 py-0.5 text-xs font-medium bg-success/20 text-success rounded-full">
                Activo
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">
            Encuentra viajes compartidos cerca de ti
          </p>
        </div>
        
        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-secondary transition-colors shrink-0" />
      </div>

      {/* Quick stats when no active search */}
      {!hasActiveSearch && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="relative flex gap-4 mt-4 pt-4 border-t border-border/50"
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>±15 min</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Euro className="w-4 h-4" />
            <span>Ahorra hasta 70%</span>
          </div>
        </motion.div>
      )}
    </motion.button>
  );
};

export default PassengerCard;
