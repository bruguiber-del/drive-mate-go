import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { X, MapPin, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { MAPBOX_TOKEN, MAPBOX_STYLE } from '@/lib/mapboxConfig';
import type { PickedPlace } from '@/components/PlacePicker';

mapboxgl.accessToken = MAPBOX_TOKEN;

interface MapLocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (place: PickedPlace) => void;
  /** Centro inicial [lat, lng] — tu ubicación real si se conoce. */
  initialCenter?: [number, number] | null;
}

/** Mapa aparte (sin rutas, sin GPS en vivo) solo para mover y elegir un
 *  punto a mano — con un chinche fijo en el centro de la pantalla y el
 *  propio mapa moviéndose debajo, igual que Uber/Google Maps al elegir
 *  una dirección en el mapa en vez de buscarla por texto. */
const MapLocationPicker = ({ isOpen, onClose, onConfirm, initialCenter }: MapLocationPickerProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!isOpen || !mapContainer.current || map.current) return;
    const center: [number, number] = initialCenter
      ? [initialCenter[1], initialCenter[0]]
      : [-0.4087, 42.1401];
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAPBOX_STYLE,
      center,
      zoom: 16,
      attributionControl: false,
    });
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    requestAnimationFrame(() => map.current?.resize());

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [isOpen, initialCenter]);

  const handleConfirm = async () => {
    if (!map.current) return;
    const { lat, lng } = map.current.getCenter();
    setResolving(true);
    try {
      const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, language: 'es', limit: '1' });
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params.toString()}`);
      const data = await res.json();
      const name = data?.features?.[0]?.place_name ?? 'Punto marcado en el mapa';
      onConfirm({ name, lat, lng });
    } catch {
      onConfirm({ name: 'Punto marcado en el mapa', lat, lng });
    } finally {
      setResolving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-background"
    >
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Chinche fijo en el centro — el mapa se mueve debajo, el punto que
          cuenta es siempre el centro exacto de la pantalla. */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginBottom: '2rem' }}>
        <MapPin className="w-9 h-9 text-primary drop-shadow-lg" fill="currentColor" />
      </div>

      <div
        className="absolute left-0 right-0 flex items-center justify-between px-3"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
        <Button variant="glass" size="icon-sm" onClick={onClose} aria-label="Cancelar">
          <X className="w-4 h-4" />
        </Button>
        <div className="glass-strong rounded-full px-3 py-1.5 text-xs font-medium text-foreground">
          Mueve el mapa para elegir el sitio
        </div>
        <div className="w-8" />
      </div>

      <div
        className="absolute left-3 right-3"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
      >
        <Button className="w-full shadow-float" size="lg" onClick={handleConfirm} disabled={resolving}>
          {resolving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
          Confirmar este sitio
        </Button>
      </div>
    </motion.div>
  );
};

export default MapLocationPicker;
