import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Navigation, X, Clock, Loader2, Plane, Car, Footprints, Bike,
  Fuel, ShoppingCart, Dumbbell, UtensilsCrossed, Coffee, ParkingCircle, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAPBOX_TOKEN } from '@/lib/mapboxConfig';
import { findMatchingAirport } from '@/lib/majorAirports';
import type { TravelMode } from '@/hooks/useRouting';

interface NavigationSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (destination: string, coords: { lng: number; lat: number }, mode: TravelMode) => void;
  /** Ubicación real del usuario [lat, lng] — se usa para priorizar resultados cercanos */
  userLocation?: [number, number] | null;
  /** Modo de transporte seleccionado; se conserva entre aperturas del buscador. */
  travelMode: TravelMode;
  onTravelModeChange: (mode: TravelMode) => void;
}

const TRAVEL_MODES: { value: TravelMode; label: string; icon: typeof Car }[] = [
  { value: 'driving', label: 'Coche', icon: Car },
  { value: 'walking', label: 'A pie', icon: Footprints },
  { value: 'cycling', label: 'Bici', icon: Bike },
];

/** Categorías estilo Google Maps — usan la Category Search de Mapbox
 *  (mismo access token, sin API nueva que dar de alta). */
const POI_CATEGORIES: { id: string; label: string; icon: typeof Fuel }[] = [
  { id: 'gas_station', label: 'Gasolineras', icon: Fuel },
  { id: 'supermarket', label: 'Supermercados', icon: ShoppingCart },
  { id: 'gym', label: 'Gimnasios', icon: Dumbbell },
  { id: 'restaurant', label: 'Restaurantes', icon: UtensilsCrossed },
  { id: 'cafe', label: 'Cafeterías', icon: Coffee },
  { id: 'parking_lot', label: 'Aparcamientos', icon: ParkingCircle },
  { id: 'charging_station', label: 'Cargadores', icon: Zap },
];

interface SearchResult {
  id: string;
  /** mapbox_id de la Search Box API (necesario para /retrieve). Vacío para
   *  resultados locales (aeropuertos) que ya traen sus coordenadas. */
  mapboxId: string;
  name: string;
  place_name: string;
  /** Presente solo en resultados locales (lista de aeropuertos) — evita
   *  tener que llamar a /retrieve, ya que las coordenadas ya se conocen. */
  localCoords?: { lat: number; lng: number };
}

interface RecentDestination {
  name: string;
  address: string;
  coords: { lng: number; lat: number };
}

const RECENT_KEY = 'vimatch_recent_destinations';
const MAX_RECENTS = 5;

// Antes esta lista era fija (Zaragoza, Jaca, Huesca) sin importar dónde
// buscara el usuario de verdad — se guarda en localStorage lo que realmente
// se navega, como haría Google Maps.
function loadRecentDestinations(): RecentDestination[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveRecentDestination(place: RecentDestination) {
  try {
    const existing = loadRecentDestinations().filter(
      (p) => p.name !== place.name || p.coords.lat !== place.coords.lat || p.coords.lng !== place.coords.lng,
    );
    const updated = [place, ...existing].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    /* almacenamiento no disponible — no bloquea la navegación */
  }
}

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

const NavigationSearch = ({ isOpen, onClose, onNavigate, userLocation, travelMode, onTravelModeChange }: NavigationSearchProps) => {
  const [destination, setDestination] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentDestinations, setRecentDestinations] = useState<RecentDestination[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [categoryResults, setCategoryResults] = useState<SearchResult[]>([]);
  const [isCategorySearching, setIsCategorySearching] = useState(false);
  const sessionTokenRef = useRef<string>(newSessionToken());

  // Nueva sesión de autocompletado cada vez que se abre el buscador, y
  // refresca la lista de recientes por si se navegó desde otra pantalla.
  useEffect(() => {
    if (isOpen) {
      sessionTokenRef.current = newSessionToken();
      setRecentDestinations(loadRecentDestinations());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!destination.trim()) {
      setSearchResults([]);
      return;
    }
    // Escribir en el buscador cancela una categoría activa (gasolineras, etc.)
    setActiveCategory(null);
    setCategoryResults([]);

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

          const results: SearchResult[] = mapped.map(({ id, mapboxId, name, place_name }: any) => ({
            id,
            mapboxId,
            name,
            place_name,
          }));

          // Mapbox no tiene bien cargados algunos aeropuertos regionales
          // como entrada propia — solo devuelve negocios dentro de ellos.
          // Si la búsqueda coincide con un aeropuerto conocido, lo ponemos
          // el primero, con coordenadas ya verificadas de la terminal.
          const airport = findMatchingAirport(destination, userLocation);
          if (airport) {
            results.unshift({
              id: `airport-${airport.name}`,
              mapboxId: '',
              name: airport.name,
              place_name: airport.name,
              localCoords: { lat: airport.lat, lng: airport.lng },
            });
          }

          setSearchResults(results);
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

    // Resultado local (aeropuerto de la lista propia) — ya trae coordenadas,
    // no hace falta llamar a Mapbox para resolverlas.
    if (result.localCoords) {
      const coords = { lng: result.localCoords.lng, lat: result.localCoords.lat };
      saveRecentDestination({ name: result.name, address: result.place_name, coords });
      onNavigate(result.place_name, coords, travelMode);
      setDestination('');
      onClose();
      return;
    }

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
        const c = { lng: coords[0], lat: coords[1] };
        saveRecentDestination({ name: result.name, address: result.place_name, coords: c });
        onNavigate(result.place_name, c, travelMode);
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

  const handleRecentDestination = (place: RecentDestination) => {
    saveRecentDestination(place);
    onNavigate(place.address, place.coords, travelMode);
    onClose();
  };

  /** Busca sitios de una categoría (gasolineras, gimnasios...) cerca de ti,
   *  como los atajos de Google Maps debajo del buscador. */
  const handleCategoryClick = async (categoryId: string) => {
    if (activeCategory === categoryId) {
      setActiveCategory(null);
      setCategoryResults([]);
      return;
    }
    setDestination('');
    setSearchResults([]);
    setActiveCategory(categoryId);
    setIsCategorySearching(true);
    try {
      const params = new URLSearchParams({
        access_token: MAPBOX_TOKEN,
        language: 'es',
        limit: '10',
      });
      if (userLocation) {
        params.set('proximity', `${userLocation[1]},${userLocation[0]}`);
      }
      const response = await fetch(
        `https://api.mapbox.com/search/searchbox/v1/category/${categoryId}?${params.toString()}`
      );
      const data = await response.json();
      const features = Array.isArray(data?.features) ? data.features : [];
      const results: SearchResult[] = features.map((f: any, i: number) => ({
        id: `${categoryId}-${i}`,
        mapboxId: '',
        name: f.properties?.name ?? 'Sin nombre',
        place_name: [f.properties?.name, f.properties?.full_address ?? f.properties?.place_formatted]
          .filter(Boolean)
          .join(' · '),
        localCoords: f.geometry?.coordinates
          ? { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }
          : undefined,
      })).filter((r: SearchResult) => r.localCoords);
      setCategoryResults(results);
    } catch (error) {
      console.error('Category search error:', error);
      setCategoryResults([]);
    } finally {
      setIsCategorySearching(false);
    }
  };

  /** Un resultado de categoría ya trae coordenadas — mismo camino que un
   *  aeropuerto de la lista local, sin llamar a /retrieve. */
  const handleSelectCategoryResult = (result: SearchResult) => {
    if (!result.localCoords) return;
    const coords = { lng: result.localCoords.lng, lat: result.localCoords.lat };
    saveRecentDestination({ name: result.name, address: result.place_name, coords });
    onNavigate(result.place_name, coords, travelMode);
    setActiveCategory(null);
    setCategoryResults([]);
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

            {/* Travel mode selector */}
            <div className="px-4 pt-3 flex gap-2">
              {TRAVEL_MODES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => onTravelModeChange(value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                    travelMode === value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="p-4">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full" />
                <input
                  type="text"
                  placeholder="Buscar destino, restaurante, tienda..."
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
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
                    onClick={() => setDestination('')}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Category shortcuts — como los atajos debajo del buscador de Google Maps */}
            {!destination && (
              <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
                {POI_CATEGORIES.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => handleCategoryClick(id)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      activeCategory === id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Category results */}
            {activeCategory && (
              <div className="px-4 pb-4 overflow-auto">
                {isCategorySearching ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : categoryResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-1 py-4 text-center">
                    No se encontró nada de esta categoría cerca.
                  </p>
                ) : (
                  <div className="glass-strong rounded-xl overflow-hidden">
                    {categoryResults.map((result, index) => (
                      <motion.button
                        key={result.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => handleSelectCategoryResult(result)}
                        className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0"
                      >
                        <MapPin className="w-5 h-5 text-primary shrink-0" />
                        <p className="text-left text-foreground text-sm line-clamp-2">{result.place_name}</p>
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Search Results */}
            {!activeCategory && searchResults.length > 0 && (
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
                      {result.localCoords ? (
                        <Plane className="w-5 h-5 text-primary shrink-0" />
                      ) : (
                        <MapPin className="w-5 h-5 text-primary shrink-0" />
                      )}
                      <p className="text-left text-foreground text-sm line-clamp-2">{result.place_name}</p>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Destinations - only show when no search results/category active */}
            {!activeCategory && searchResults.length === 0 && !destination && (
              <div className="flex-1 p-4 overflow-auto">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Destinos recientes</span>
                </div>
                {recentDestinations.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-1">
                    Los sitios a los que navegues aparecerán aquí.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recentDestinations.map((place, index) => (
                      <motion.button
                        key={`${place.name}-${place.coords.lat}-${place.coords.lng}`}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        onClick={() => handleRecentDestination(place)}
                        className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-muted transition-colors"
                      >
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <MapPin className="w-4 h-4 text-primary" />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{place.name}</p>
                          <p className="text-sm text-muted-foreground truncate">{place.address}</p>
                        </div>
                        <Navigation className="w-4 h-4 text-primary shrink-0" />
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NavigationSearch;
