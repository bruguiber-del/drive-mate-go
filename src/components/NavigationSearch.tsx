import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation, X, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAPBOX_TOKEN } from '@/lib/mapboxConfig';

interface NavigationSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (destination: string, coords: { lng: number; lat: number }) => void;
  /** Ubicación real del usuario [lat, lng] — se usa para priorizar resultados cercanos */
  userLocation?: [number, number] | null;
}

interface SearchResult {
  id: string;
  /** mapbox_id de la Search Box API (necesario para /retrieve) */
  mapboxId: string;
  name: string;
  place_name: string;
}

const recentDestinations = [
  { name: 'Zaragoza Centro', address: 'Plaza del Pilar, Zaragoza', coords: { lng: -0.8773, lat: 41.6560 }, icon: '🏛️' },
  { name: 'Jaca', address: 'Jaca, Huesca', coords: { lng: -0.5506, lat: 42.5694 }, icon: '⛰️' },
  { name: 'Huesca', address: 'Huesca, Aragón', coords: { lng: -0.4087, lat: 42.1401 }, icon: '🏠' },
];

/**
 * Categorías de "lugar importante" (infraestructura de transporte y sanitaria).
 * Se colocan por delante de negocios genéricos con nombre parecido
 * (alquiler de coches, transporte privado, agencias de viaje...).
 */
const MAJOR_POI_CATEGORIES = [
  'airport',
  'international_airport',
  'airport_terminal',
  'train_station',
  'railway_station',
  'bus_station',
  'transit_station',
  'ferry_terminal',
  'port',
  'harbor',
  'hospital',
  'medical_clinic',
  'emergency_room',
];

const GENERIC_BUSINESS_CATEGORIES = [
  'car_rental',
  'rental_car_agency',
  'ridesharing',
  'taxi',
  'travel_agency',
  'parking_lot',
  'parking',
  'office',
  'shop',
  'store',
];

/** 0 = lugar importante, 1 = normal, 2 = negocio genérico. */
const categoryRank = (categories: string[]): number => {
  const normalized = categories.map((c) => String(c).toLowerCase());
  if (normalized.some((c) => MAJOR_POI_CATEGORIES.some((m) => c === m || c.includes(m)))) return 0;
  if (normalized.some((c) => GENERIC_BUSINESS_CATEGORIES.some((g) => c === g || c.includes(g)))) return 2;
  return 1;
};

const newSessionToken = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const NavigationSearch = ({ isOpen, onClose, onNavigate, userLocation }: NavigationSearchProps) => {
  const [destination, setDestination] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const sessionTokenRef = useRef<string>(newSessionToken());

  // Nueva sesión de autocompletado cada vez que se abre el buscador
  useEffect(() => {
    if (isOpen) sessionTokenRef.current = newSessionToken();
  }, [isOpen]);

  useEffect(() => {
    if (!destination.trim()) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const params = new URLSearchParams({
          q: destination,
          access_token: MAPBOX_TOKEN,
          session_token: sessionTokenRef.current,
          language: 'es',
          country: 'es',
          limit: '8',
          types: 'poi,address,place',
        });
        if (userLocation) {
          params.set('proximity', `${userLocation[1]},${userLocation[0]}`);
        }

        const response = await fetch(
          `https://api.mapbox.com/search/searchbox/v1/suggest?${params.toString()}`
        );
        const data = await response.json();
        if (cancelled) return;

        if (Array.isArray(data.suggestions)) {
          const mapped = data.suggestions.map((s: any, i: number) => ({
            id: `${s.mapbox_id}-${i}`,
            mapboxId: s.mapbox_id,
            name: s.name,
            place_name: [s.name, s.full_address ?? s.place_formatted].filter(Boolean).join(' · '),
            rank: categoryRank([
              ...(Array.isArray(s.poi_category) ? s.poi_category : s.poi_category ? [s.poi_category] : []),
              ...(Array.isArray(s.poi_category_ids) ? s.poi_category_ids : []),
            ]),
            order: i,
          }));

          // Estable: lugares importantes primero, negocios genéricos al final,
          // conservando el orden de relevancia de Mapbox dentro de cada grupo.
          mapped.sort((a: any, b: any) => a.rank - b.rank || a.order - b.order);

          setSearchResults(
            mapped.map(({ id, mapboxId, name, place_name }: any) => ({ id, mapboxId, name, place_name }))
          );
        } else {
          setSearchResults([]);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [destination, userLocation]);

  /** Al pulsar un resultado se resuelven sus coordenadas y se navega al instante. */
  const handleSelectResult = async (result: SearchResult) => {
    setDestination(result.place_name);
    setSearchResults([]);
    setIsSearching(true);
    try {
      const params = new URLSearchParams({
        access_token: MAPBOX_TOKEN,
        session_token: sessionTokenRef.current,
        language: 'es',
      });
      const response = await fetch(
        `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(result.mapboxId)}?${params.toString()}`
      );
      const data = await response.json();
      const coords = data?.features?.[0]?.geometry?.coordinates;
      if (Array.isArray(coords)) {
        onNavigate(result.place_name, { lng: coords[0], lat: coords[1] });
        setDestination('');
        onClose();
      }
    } catch (error) {
      console.error('Retrieve error:', error);
    } finally {
      setIsSearching(false);
      // El token de sesión se retira tras el retrieve
      sessionTokenRef.current = newSessionToken();
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
                  placeholder="Buscar destino, restaurante, tienda..."
                  value={destination}
                  onChange={(e) => {
                    setDestination(e.target.value);
                    setSelectedResult(null);
                    setSelectedCoords(null);
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
                      setSelectedCoords(null);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="px-4 pb-4 overflow-auto">
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
                  disabled={!selectedCoords}
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
