import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { MAPBOX_TOKEN } from '@/lib/mapboxConfig';

export interface PickedPlace {
  name: string;
  lat: number;
  lng: number;
}

interface Suggestion {
  mapboxId: string;
  name: string;
  placeName: string;
}

interface PlacePickerProps {
  placeholder?: string;
  initialValue?: string;
  onSelect: (place: PickedPlace) => void;
  /** Ubicación real del usuario [lat, lng] — sin esto Mapbox ordena los
   *  resultados por relevancia de texto a secas, así que una búsqueda
   *  normal (p. ej. "blanca dona eivissa") puede devolver calles de otras
   *  provincias antes que nada de donde estás de verdad. */
  userLocation?: [number, number] | null;
}

const newSessionToken = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Campo de texto con sugerencias de lugar — para elegir un punto suelto
 *  (Casa, Trabajo, origen de un viaje habitual...), no para la navegación
 *  completa (que tiene su propio buscador en NavigationSearch). Usa la
 *  misma Search Box API (suggest + retrieve) y el mismo reintento quitando
 *  palabras finales que NavigationSearch — la geocodificación clásica de
 *  Mapbox (geocoding/v5) que usaba antes buscaba mucho peor: "blanca dona
 *  eivissa" no encontraba nada cercano, solo calles de otras provincias. */
const PlacePicker = ({ placeholder = 'Buscar dirección...', initialValue = '', onSelect, userLocation }: PlacePickerProps) => {
  const [query, setQuery] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionTokenRef = useRef(newSessionToken());

  useEffect(() => {
    if (!query.trim() || query === initialValue) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const fetchSuggestions = async (q: string): Promise<Suggestion[]> => {
          const params = new URLSearchParams({
            q,
            access_token: MAPBOX_TOKEN,
            session_token: sessionTokenRef.current,
            language: 'es',
            country: 'es',
            limit: '5',
            // "street" aparte de "address": una calle buscada sin número
            // (p. ej. "Carrer de Aragón") es su propio tipo en Mapbox, no
            // una "address" — sin esto no aparecía nunca, por bien que se
            // escribiera.
            types: 'poi,address,place,street',
          });
          if (userLocation) {
            params.set('proximity', `${userLocation[1]},${userLocation[0]}`);
          }
          const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?${params.toString()}`);
          const data = await res.json();
          return Array.isArray(data?.suggestions)
            ? data.suggestions.map((s: any) => ({
                mapboxId: s.mapbox_id,
                name: s.name as string,
                placeName: [s.name, s.full_address ?? s.place_formatted].filter(Boolean).join(' · '),
              }))
            : [];
        };

        // Igual que en NavigationSearch: si la búsqueda completa no da
        // nada, se reintenta quitando la última palabra una a una (p. ej.
        // "blanca dona pabellón" no daba nada, "blanca dona" sí).
        let found = await fetchSuggestions(query);
        if (!cancelled && found.length === 0) {
          const words = query.trim().split(/\s+/);
          for (let n = words.length - 1; n >= 1 && found.length === 0; n--) {
            found = await fetchSuggestions(words.slice(0, n).join(' '));
            if (cancelled) return;
          }
        }
        if (cancelled) return;
        setSuggestions(found);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [query, initialValue, userLocation]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handlePick = async (s: Suggestion) => {
    setQuery(s.placeName);
    setSuggestions([]);
    setShowResults(false);
    setIsSearching(true);
    try {
      const params = new URLSearchParams({
        access_token: MAPBOX_TOKEN,
        session_token: sessionTokenRef.current,
        language: 'es',
      });
      const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(s.mapboxId)}?${params.toString()}`);
      const data = await res.json();
      const coords = data?.features?.[0]?.geometry?.coordinates;
      if (Array.isArray(coords)) {
        onSelect({ name: s.placeName, lng: coords[0], lat: coords[1] });
      }
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
          onFocus={() => setShowResults(true)}
          className="w-full pl-9 pr-8 py-2.5 bg-muted rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
      </div>
      {showResults && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full glass-strong rounded-lg overflow-hidden max-h-48 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s.mapboxId}
              type="button"
              className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0"
              onClick={() => handlePick(s)}
            >
              {s.placeName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlacePicker;
