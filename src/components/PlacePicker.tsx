import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { MAPBOX_TOKEN } from '@/lib/mapboxConfig';

export interface PickedPlace {
  name: string;
  lat: number;
  lng: number;
}

interface PlacePickerProps {
  placeholder?: string;
  initialValue?: string;
  onSelect: (place: PickedPlace) => void;
}

/** Campo de texto con sugerencias de lugar (geocodificación directa de
 *  Mapbox) — para elegir un punto suelto, no para la navegación completa
 *  (que ya tiene su propio buscador en NavigationSearch). */
const PlacePicker = ({ placeholder = 'Buscar dirección...', initialValue = '', onSelect }: PlacePickerProps) => {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<PickedPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim() || query === initialValue) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const params = new URLSearchParams({
          access_token: MAPBOX_TOKEN,
          language: 'es',
          country: 'es',
          autocomplete: 'true',
          limit: '5',
        });
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`,
        );
        const data = await res.json();
        if (cancelled) return;
        const places: PickedPlace[] = Array.isArray(data?.features)
          ? data.features.map((f: any) => ({ name: f.place_name as string, lat: f.center[1], lng: f.center[0] }))
          : [];
        setResults(places);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [query, initialValue]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

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
      {showResults && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full glass-strong rounded-lg overflow-hidden max-h-48 overflow-y-auto">
          {results.map((place, i) => (
            <button
              key={`${place.lat}-${place.lng}-${i}`}
              type="button"
              className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0"
              onClick={() => {
                setQuery(place.name);
                setResults([]);
                setShowResults(false);
                onSelect(place);
              }}
            >
              {place.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlacePicker;
