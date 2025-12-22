import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation, X, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavigationSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (destination: string, coords: { lng: number; lat: number }) => void;
}

interface SearchResult {
  id: string;
  place_name: string;
  center: [number, number];
}

const recentDestinations = [
  { name: 'Zaragoza Centro', address: 'Plaza del Pilar, Zaragoza', coords: { lng: -0.8773, lat: 41.6560 }, icon: '🏛️' },
  { name: 'Jaca', address: 'Jaca, Huesca', coords: { lng: -0.5506, lat: 42.5694 }, icon: '⛰️' },
  { name: 'Huesca', address: 'Huesca, Aragón', coords: { lng: -0.4087, lat: 42.1401 }, icon: '🏠' },
];

const NavigationSearch = ({ isOpen, onClose, onNavigate }: NavigationSearchProps) => {
  const [destination, setDestination] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);

  const mapboxToken = localStorage.getItem('vimatch_mapbox_token');

  useEffect(() => {
    if (!destination.trim() || !mapboxToken) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(destination)}.json?access_token=${mapboxToken}&country=es&limit=5&language=es`
        );
        const data = await response.json();
        if (data.features) {
          setSearchResults(data.features.map((f: any) => ({
            id: f.id,
            place_name: f.place_name,
            center: f.center,
          })));
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [destination, mapboxToken]);

  const handleSelectResult = (result: SearchResult) => {
    setSelectedResult(result);
    setDestination(result.place_name);
    setSearchResults([]);
  };

  const handleNavigate = () => {
    if (selectedResult) {
      onNavigate(selectedResult.place_name, { lng: selectedResult.center[0], lat: selectedResult.center[1] });
      onClose();
      setDestination('');
      setSelectedResult(null);
    }
  };

  const handleRecentDestination = (place: typeof recentDestinations[0]) => {
    onNavigate(place.address, place.coords);
    onClose();
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
                  onChange={(e) => {
                    setDestination(e.target.value);
                    setSelectedResult(null);
                  }}
                  autoFocus
                  className="w-full pl-10 pr-12 py-4 bg-muted rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-lg"
                />
                {isSearching && (
                  <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-muted-foreground" />
                )}
                {destination && !isSearching && (
                  <Button 
                    variant="ghost" 
                    size="icon-sm" 
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => {
                      setDestination('');
                      setSelectedResult(null);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="px-4 pb-4">
                <div className="glass-strong rounded-xl overflow-hidden">
                  {searchResults.map((result, index) => (
                    <motion.button
                      key={result.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => handleSelectResult(result)}
                      className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0"
                    >
                      <MapPin className="w-5 h-5 text-primary shrink-0" />
                      <p className="text-left text-foreground text-sm line-clamp-2">{result.place_name}</p>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Destinations - only show when no search results */}
            {searchResults.length === 0 && !destination && (
              <div className="flex-1 p-4 overflow-auto">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Destinos frecuentes</span>
                </div>
                <div className="space-y-2">
                  {recentDestinations.map((place, index) => (
                    <motion.button
                      key={place.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      onClick={() => handleRecentDestination(place)}
                      className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-muted transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xl">
                        {place.icon}
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-medium text-foreground">{place.name}</p>
                        <p className="text-sm text-muted-foreground">{place.address}</p>
                      </div>
                      <Navigation className="w-4 h-4 text-primary" />
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Navigate Button */}
            {selectedResult && (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="p-4 border-t border-border mt-auto"
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
