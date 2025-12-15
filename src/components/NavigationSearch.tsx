import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation, X, Clock, Star, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavigationSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (destination: string) => void;
}

const recentDestinations = [
  { name: 'Casa', address: 'Calle Mayor 15, Madrid', icon: '🏠' },
  { name: 'Trabajo', address: 'Paseo de la Castellana 100', icon: '💼' },
  { name: 'Gimnasio', address: 'Calle Serrano 45', icon: '🏋️' },
];

const NavigationSearch = ({ isOpen, onClose, onNavigate }: NavigationSearchProps) => {
  const [destination, setDestination] = useState('');

  const handleNavigate = () => {
    if (destination.trim()) {
      onNavigate(destination);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '-100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed inset-0 z-50 bg-background"
        >
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon-sm" onClick={onClose}>
                  <X className="w-5 h-5" />
                </Button>
                <h2 className="text-lg font-bold text-foreground">¿A dónde quieres ir?</h2>
              </div>
            </div>

            {/* Search Input */}
            <div className="p-4">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full" />
                <input
                  type="text"
                  placeholder="Buscar destino..."
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  autoFocus
                  className="w-full pl-10 pr-12 py-4 bg-muted rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-lg"
                />
                {destination && (
                  <Button 
                    variant="ghost" 
                    size="icon-sm" 
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setDestination('')}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Current Location */}
            <div className="px-4">
              <button className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-muted transition-colors">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Navigation className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-foreground">Tu ubicación actual</p>
                  <p className="text-sm text-muted-foreground">Usar GPS</p>
                </div>
              </button>
            </div>

            {/* Recent Destinations */}
            <div className="flex-1 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Recientes</span>
              </div>
              <div className="space-y-2">
                {recentDestinations.map((place, index) => (
                  <motion.button
                    key={place.name}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    onClick={() => {
                      setDestination(place.address);
                      onNavigate(place.address);
                      onClose();
                    }}
                    className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-muted transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xl">
                      {place.icon}
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-medium text-foreground">{place.name}</p>
                      <p className="text-sm text-muted-foreground">{place.address}</p>
                    </div>
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Navigate Button */}
            {destination && (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="p-4 border-t border-border"
              >
                <Button 
                  variant="default" 
                  size="xl" 
                  className="w-full"
                  onClick={handleNavigate}
                >
                  <Navigation className="w-5 h-5" />
                  Iniciar navegación
                </Button>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NavigationSearch;
