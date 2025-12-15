import { motion } from 'framer-motion';
import { Search, MapPin } from 'lucide-react';

interface SearchBarProps {
  onClick: () => void;
  value?: string;
}

const SearchBar = ({ onClick, value }: SearchBarProps) => {
  return (
    <motion.button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-4 glass rounded-2xl text-left group"
      whileTap={{ scale: 0.98 }}
    >
      <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center group-hover:scale-110 transition-transform">
        <MapPin className="w-5 h-5 text-secondary-foreground" />
      </div>
      <div className="flex-1">
        <p className="text-foreground font-medium">
          {value || '¿A dónde vas?'}
        </p>
        <p className="text-sm text-muted-foreground">
          Busca tu destino
        </p>
      </div>
      <Search className="w-5 h-5 text-muted-foreground" />
    </motion.button>
  );
};

export default SearchBar;
