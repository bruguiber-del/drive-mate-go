import { motion } from 'framer-motion';
import { Users, ChevronRight } from 'lucide-react';

interface PassengerCardProps {
  onClick: () => void;
  hasActiveSearch?: boolean;
}

const PassengerCard = ({ onClick, hasActiveSearch }: PassengerCardProps) => {
  return (
    <motion.button
      onClick={onClick}
      className="glass rounded-xl px-3 py-2 text-left group overflow-hidden relative max-w-[200px]"
      whileTap={{ scale: 0.98 }}
    >
      <div className="relative flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <Users className="w-4 h-4 text-secondary-foreground" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-foreground text-sm">Buscar conductores</p>
            {hasActiveSearch && (
              <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
            )}
          </div>
        </div>
        
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-secondary transition-colors shrink-0" />
      </div>
    </motion.button>
  );
};

export default PassengerCard;
