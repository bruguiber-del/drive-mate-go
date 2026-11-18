import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Navigation, X, Clock, Loader2, Plane, Car, Footprints, Bike,
  Fuel, ShoppingCart, Dumbbell, UtensilsCrossed, Coffee, ParkingCircle, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAPBOX_TOKEN } from '@/lib/mapboxConfig';
import { findNamedPlace } from '@/lib/namedPlaces';
import { normalizeSearchQuery, dropTrailingN, mergeDeWithTrailingN, FAR_SUGGESTION_THRESHOLD_M } from '@/lib/searchQueryNormalize';
import { haversineKm } from '@/lib/geo';
import { overlayTop } from '@/lib/overlayLayout';
import type { TravelMode } from '@/hooks/useRouting';
import type { SavedPlace } from '@/hooks/useSavedPlaces';
import { getSavedPlaceIcon } from '@/lib/savedPlaceIcons';

interface NavigationSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (destination: string, coords: { lng: number; lat: number }, mode: TravelMode) => void;
  /** Ubicación real del usuario [lat, lng] — se usa para priorizar resultados cercanos */
  userLocation?: [number, number] | null;
  /** Modo de transporte seleccionado; se conserva entre aperturas del buscador. */
  travelMode: TravelMode;
  onTravelModeChange: (mode: TravelMode) => void;
  /** 'destination' (por defecto) sustituye el destino actual, como hasta
   *  ahora. 'stop' añade el sitio elegido como parada intermedia de la
   *  ruta activa (gasolinera, súper...) sin tocar el destino final — usa
   *  onAddStop en vez de onNavigate y no muestra el selector de modo de
   *  transporte ni los destinos recientes. */
  mode?: 'destination' | 'stop';
  onAddStop?: (name: string, coords: { lng: number; lat: number }) => void;
  /** Casa, trabajo y demás — acceso rápido también desde el propio buscador. */
  savedPlaces?: SavedPlace[];
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
  /** Minutos de conducción real (Mapbox Directions Matrix) desde tu
   *  posición hasta este sitio — solo en resultados de categoría. */
  detourMin?: number;
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

const NavigationSearch = ({
  isOpen,
  onClose,
  onNavigate,
  userLocation,
  travelMode,
  onTravelModeChange,
  mode = 'destination',
  onAddStop,
  savedPlaces = [],
}: NavigationSearchProps) => {
  const isStopMode = mode === 'stop';
  const [destination, setDestination] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentDestinations, setRecentDestinations] = useState<RecentDestination[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [categoryResults, setCategoryResults] = useState<SearchResult[]>([]);
  const [isCategorySearching, setIsCategorySearching] = useState(false);
  const sessionTokenRef = useRef<string>(newSessionToken());
  /** Para descartar una respuesta de la Matrix API si mientras tanto se
   *  cambió o cerró la categoría activa. */
  const categoryRequestIdRef = useRef(0);

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
    categoryRequestIdRef.current++;
    setActiveCategory(null);
    setCategoryResults([]);

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const fetchSuggestions = async (q: string) => {
          const params = new URLSearchParams({
            q: normalizeSearchQuery(q),
            access_token: MAPBOX_TOKEN,
            session_token: sessionTokenRef.current,
            language: 'es',
            country: 'es',
            limit: '8',
            // "street" aparte de "address": una calle buscada sin número
            // (p. ej. "Carrer de Aragón") es su propio tipo en Mapbox, no
            // una "address" — sin esto no aparecía nunca, por bien que se
            // escribiera.
            types: 'poi,address,place,street',
          });
          if (userLocation) {
            params.set('proximity', `${userLocation[1]},${userLocation[0]}`);
          }
          const response = await fetch(
            `https://api.mapbox.com/search/searchbox/v1/suggest?${params.toString()}`
          );
          const data = await response.json();
          return Array.isArray(data.suggestions) ? data.suggestions : [];
        };

        // "Cerca" de verdad, no solo "hay algo" — Mapbox puede preferir
        // una coincidencia de texto exacta pero a cientos de km antes que
        // una parecida pero al lado (confirmado contra la propia API:
        // "carrer de aragon 92" solo da direcciones en Valencia/Castellón,
        // nunca la de Eivissa, aunque exista con ese nombre cerca).
        const hasNearbyResult = (list: { distance?: number }[]) =>
          list.some((s) => typeof s.distance !== 'number' || s.distance <= FAR_SUGGESTION_THRESHOLD_M);
        const goodEnough = (list: { distance?: number }[]) => (userLocation ? hasNearbyResult(list) : list.length > 0);

        // Mapbox no encuentra nada si a un nombre de sitio le sigue una
        // palabra genérica de categoría que no sabe ligar bien (p. ej.
        // "blanca dona pabellón" no da nada, pero "blanca dona" sí) —
        // Google Maps sí resuelve eso. Como paliativo gratuito, si la
        // búsqueda completa no da nada bueno cerca se reintenta quitando
        // la última palabra, una a una, hasta dar con algo.
        let suggestions = await fetchSuggestions(destination);
        if (!cancelled && !goodEnough(suggestions)) {
          const words = destination.trim().split(/\s+/);
          for (let n = words.length - 1; n >= 1 && !goodEnough(suggestions); n--) {
            const retry = await fetchSuggestions(words.slice(0, n).join(' '));
            if (cancelled) return;
            if (retry.length > 0) suggestions = retry;
          }
        }
        // Alguna palabra termina en "-on"/"-ón" (Aragón, Castellón...) y
        // el nombre real es la forma catalana en "-ó".
        if (!cancelled && !goodEnough(suggestions)) {
          const words = destination.trim().split(/\s+/);
          for (let i = 0; i < words.length && !goodEnough(suggestions); i++) {
            const alt = dropTrailingN(words[i]);
            if (!alt) continue;
            const variant = [...words.slice(0, i), alt, ...words.slice(i + 1)].join(' ');
            const retry = await fetchSuggestions(variant);
            if (cancelled) return;
            if (retry.length > 0) suggestions = retry;
          }
        }
        // Último recurso: "de Aragón" a la española, cuando el nombre
        // real catalán no lleva "de" en absoluto, lleva "d'" pegado
        // ("d'Aragó") — se prueba fusionando ambas palabras en una.
        if (!cancelled && !goodEnough(suggestions)) {
          const merged = mergeDeWithTrailingN(destination.trim().split(/\s+/));
          if (merged) {
            const retry = await fetchSuggestions(merged.join(' '));
            if (cancelled) return;
            if (retry.length > 0) suggestions = retry;
          }
        }
        if (cancelled) return;

        const mapped = suggestions.map((s: any, i: number) => ({
          id: `${s.mapbox_id}-${i}`,
          mapboxId: s.mapbox_id,
          name: s.name,
          place_name: [s.name, s.full_address ?? s.place_formatted].filter(Boolean).join(' · '),
          rank: categoryRank([
            ...(Array.isArray(s.poi_category) ? s.poi_category : s.poi_category ? [s.poi_category] : []),
            ...(Array.isArray(s.poi_category_ids) ? s.poi_category_ids : []),
          ]),
          distance: typeof s.distance === 'number' ? s.distance : Infinity,
          order: i,
        }));

        // Estable: lugares importantes primero, el más cercano dentro de
        // cada grupo, y el orden de relevancia de Mapbox como último
        // desempate.
        mapped.sort((a: any, b: any) => a.rank - b.rank || a.distance - b.distance || a.order - b.order);

        const results: SearchResult[] = mapped.map(({ id, mapboxId, name, place_name }: any) => ({
          id,
          mapboxId,
          name,
          place_name,
        }));

        // Mapbox no tiene bien cargados algunos sitios conocidos (aeropuertos
        // regionales, pabellones pequeños...) — solo devuelve negocios
        // dentro de ellos, o nada en absoluto. Si la búsqueda coincide con
        // uno de la lista propia (ver namedPlaces.ts), lo ponemos el
        // primero, con coordenadas verificadas a mano.
        const namedPlace = findNamedPlace(destination, userLocation);
        if (namedPlace) {
          results.unshift({
            id: `named-${namedPlace.name}`,
            mapboxId: '',
            name: namedPlace.name,
            place_name: namedPlace.name,
            localCoords: { lat: namedPlace.lat, lng: namedPlace.lng },
          });
        }

        setSearchResults(results);
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
      if (isStopMode) {
        onAddStop?.(result.name, coords);
      } else {
        saveRecentDestination({ name: result.name, address: result.place_name, coords });
        onNavigate(result.place_name, coords, travelMode);
      }
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
        if (isStopMode) {
          onAddStop?.(result.name, c);
        } else {
          saveRecentDestination({ name: result.name, address: result.place_name, coords: c });
          onNavigate(result.place_name, c, travelMode);
        }
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

  const handleSavedPlaceClick = (place: SavedPlace) => {
    const coords = { lng: place.lng, lat: place.lat };
    if (isStopMode) {
      onAddStop?.(place.label, coords);
    } else {
      onNavigate(place.name, coords, travelMode);
    }
    onClose();
  };

  /** Busca sitios de una categoría (gasolineras, gimnasios...) cerca de ti,
   *  como los atajos de Google Maps debajo del buscador. */
  const handleCategoryClick = async (categoryId: string) => {
    const requestId = ++categoryRequestIdRef.current;
    if (activeCategory === categoryId) {
      categoryRequestIdRef.current++;
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

      // De más cerca a más lejos — en línea recta de entrada (inmediato),
      // y se reordena por tiempo real de conducción en cuanto llega la matriz.
      if (userLocation) {
        results.sort(
          (a, b) =>
            haversineKm(userLocation[0], userLocation[1], a.localCoords!.lat, a.localCoords!.lng) -
            haversineKm(userLocation[0], userLocation[1], b.localCoords!.lat, b.localCoords!.lng),
        );
      }
      setCategoryResults(results);

      // Minutos reales de conducción a cada sitio — una sola llamada a la
      // Matrix API de Mapbox (no N llamadas a Directions por resultado).
      if (userLocation && results.length > 0) {
        fetchCategoryDetours(userLocation, results, requestId);
      }
    } catch (error) {
      console.error('Category search error:', error);
      setCategoryResults([]);
    } finally {
      setIsCategorySearching(false);
    }
  };

  /** Rellena `detourMin` de cada resultado con el tiempo de conducción real
   *  desde tu posición (Directions Matrix, una sola petición) y reordena la
   *  lista por ese tiempo real en vez de la línea recta usada como adelanto. */
  const fetchCategoryDetours = async (origin: [number, number], results: SearchResult[], requestId: number) => {
    try {
      const coords = [
        `${origin[1]},${origin[0]}`,
        ...results.map((r) => `${r.localCoords!.lng},${r.localCoords!.lat}`),
      ].join(';');
      const params = new URLSearchParams({
        access_token: MAPBOX_TOKEN,
        sources: '0',
        annotations: 'duration',
      });
      const response = await fetch(
        `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}?${params.toString()}`
      );
      const data = await response.json();
      const durations: (number | null)[] | undefined = data?.durations?.[0];
      if (!Array.isArray(durations) || requestId !== categoryRequestIdRef.current) return;

      const withDetour = results.map((r, i) => ({
        ...r,
        detourMin: typeof durations[i + 1] === 'number' ? Math.round(durations[i + 1] / 60) : undefined,
      }));
      withDetour.sort((a, b) => (a.detourMin ?? Infinity) - (b.detourMin ?? Infinity));
      setCategoryResults(withDetour);
    } catch (error) {
      console.error('Matrix error:', error);
    }
  };

  /** Un resultado de categoría ya trae coordenadas — mismo camino que un
   *  aeropuerto de la lista local, sin llamar a /retrieve. */
  const handleSelectCategoryResult = (result: SearchResult) => {
    if (!result.localCoords) return;
    const coords = { lng: result.localCoords.lng, lat: result.localCoords.lat };
    if (isStopMode) {
      onAddStop?.(result.name, coords);
    } else {
      saveRecentDestination({ name: result.name, address: result.place_name, coords });
      onNavigate(result.place_name, coords, travelMode);
    }
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
            {/* Header — esta pantalla ocupa todo el alto desde arriba
                (fixed inset-0), así que sin contar el notch/isla dinámica
                el título y la X quedaban tapados por la barra de estado,
                igual que le pasaba al menú de ajustes (SettingsMenu). */}
            <div className="p-4 border-b border-border shrink-0" style={{ paddingTop: overlayTop(16) }}>
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon-sm" onClick={onClose}>
                  <X className="w-5 h-5" />
                </Button>
                <h2 className="text-lg font-bold text-foreground">
                  {isStopMode ? 'Añadir parada en la ruta' : '¿A dónde quieres ir?'}
                </h2>
              </div>
              {isStopMode && (
                <p className="text-xs text-muted-foreground mt-1 ml-11">
                  Se añade a tu ruta actual sin cambiar el destino final.
                </p>
              )}
            </div>

            {/* Travel mode selector — no aplica al añadir una parada, la
                ruta activa ya tiene su propio modo de transporte. */}
            {!isStopMode && (
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
            )}

            {/* Search Input */}
            <div className="p-4">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full" />
                <input
                  type="text"
                  placeholder="Buscar destino, restaurante, tienda..."
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  onKeyDown={(e) => {
                    // Antes, darle a Intro no hacía nada — había que esperar
                    // a que terminara de buscar y tocar el primer resultado
                    // a mano. Esto va al primero de la lista directamente,
                    // como en Google Maps.
                    if (e.key === 'Enter' && searchResults.length > 0) {
                      e.preventDefault();
                      handleSelectResult(searchResults[0]);
                    }
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
                        <p className="text-left text-foreground text-sm line-clamp-2 flex-1 min-w-0">{result.place_name}</p>
                        {result.detourMin != null && (
                          <span className="text-xs font-semibold text-primary shrink-0">+{result.detourMin} min</span>
                        )}
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

            {/* Lugares guardados y destinos recientes - only show when no search results/category active */}
            {!activeCategory && searchResults.length === 0 && !destination && (
              <div className="flex-1 p-4 overflow-auto">
                {savedPlaces.length > 0 && (
                  <div className="flex gap-2 mb-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {savedPlaces.map((p) => {
                      const Icon = getSavedPlaceIcon(p);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleSavedPlaceClick(p)}
                          className="shrink-0 flex items-center gap-1.5 pl-2 pr-3 py-2 rounded-full bg-muted hover:bg-muted/70 transition-colors text-sm font-medium text-foreground"
                        >
                          <Icon className="w-4 h-4 text-primary shrink-0" />
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Los destinos recientes son del modo "destino" — en modo
                    "parada" no tienen sentido (sustituirían el destino en
                    vez de sumarse a la ruta), igual que antes. */}
                {!isStopMode && (
                  <>
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
                  </>
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
