import { memo } from 'react';
import { motion } from 'framer-motion';
import { Search, Navigation } from 'lucide-react';

interface SearchBarProps {
  onClick: () => void;
  destination?: string;
  isNavigating?: boolean;
}

const SearchBar = ({ onClick, destination, isNavigating }: SearchBarProps) => {
  return (
    <motion.button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-4 glass rounded-2xl text-left group"
      whileTap={{ scale: 0.98 }}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${
        isNavigating ? 'bg-primary' : 'bg-muted'
      }`}>
        {isNavigating ? (
          <Navigation className="w-5 h-5 text-primary-foreground" />
        ) : (
          <Search className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-medium truncate ${destination ? 'text-foreground' : 'text-muted-foreground'}`}>
          {destination || '¿A dónde vas?'}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          {isNavigating ? 'Navegando...' : 'Buscar destino'}
        </p>
      </div>
      {isNavigating && (
        <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
      )}
    </motion.button>
  );
};

export default memo(SearchBar);
