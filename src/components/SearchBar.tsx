import { memo } from 'react';
import { motion } from 'framer-motion';
import { Search, Car, Footprints, Bike } from 'lucide-react';
import type { TravelMode } from '@/hooks/useRouting';

interface SearchBarProps {
  onClick: () => void;
  destination?: string;
  isNavigating?: boolean;
  travelMode?: TravelMode;
  /** Overrides the default "Navegando..." subtitle, e.g. "Calculando ruta...". */
  statusText?: string;
}

const MODE_ICON: Record<TravelMode, typeof Car> = {
  driving: Car,
  walking: Footprints,
  cycling: Bike,
};

const SearchBar = ({ onClick, destination, isNavigating, travelMode = 'driving', statusText }: SearchBarProps) => {
  const ModeIcon = MODE_ICON[travelMode];
  return (
    <motion.button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2.5 glass rounded-xl text-left group"
      whileTap={{ scale: 0.98 }}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform shrink-0 ${
        isNavigating ? 'bg-primary' : 'bg-muted'
      }`}>
        {isNavigating ? (
          <ModeIcon className="w-4 h-4 text-primary-foreground" />
        ) : (
          <Search className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${destination ? 'text-foreground' : 'text-muted-foreground'}`}>
          {destination || '¿A dónde vas?'}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {isNavigating ? (statusText ?? 'Navegando...') : 'Buscar destino'}
        </p>
      </div>
      {isNavigating && (
        <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
      )}
    </motion.button>
  );
};

export default memo(SearchBar);
