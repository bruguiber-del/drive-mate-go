import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { Plus, Trash2, Loader2, LocateFixed, Map as MapIcon, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { MAPBOX_TOKEN } from '@/lib/mapboxConfig';
import type { useSavedPlaces, SavedPlace, SavedPlaceKind } from '@/hooks/useSavedPlaces';
import { SAVED_PLACE_ICON_OPTIONS, getSavedPlaceIcon } from '@/lib/savedPlaceIcons';
import PlacePicker, { type PickedPlace } from '@/components/PlacePicker';

// mapbox-gl es una librería enorme — igual que MapView en Index.tsx, se
// carga solo cuando hace falta de verdad (al abrir el selector de mapa),
// no en el arranque de toda la app. Sin esto, mapbox-gl se colaba en el
// bundle principal aunque nadie llegara a abrir este selector nunca.
const MapLocationPicker = lazy(() => import('@/components/MapLocationPicker'));
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

interface SavedPlacesSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocation?: [number, number] | null;
  /** Misma instancia que usan la barra de acceso rápido y el buscador —
   *  una llamada propia aquí no compartiría estado con esas (mismo
   *  problema ya resuelto para los viajes programados). */
  places: ReturnType<typeof useSavedPlaces>;
  /** Al tocar una Casa/Trabajo sin guardar en la barra de acceso rápido,
   *  abre esto directamente con el formulario ya puesto en ese tipo, en
   *  vez de mandar a elegirlo otra vez a mano. */
  initialKind?: SavedPlaceKind | null;
}

const KIND_LABEL: Record<SavedPlaceKind, string> = { home: 'Casa', work: 'Trabajo', other: '' };

/** Una fila de la lista, con DOS formas de moverla: un tirador propio
 *  (GripVertical) que arranca el arrastre con dragControls, y las flechas
 *  como alternativa siempre fiable. El cajón (vaul) tiene su propio gesto
 *  de "deslizar para cerrar" sobre todo el contenido, que se adelantaba y
 *  se comía cualquier intento de arrastre en la fila — el primer intento
 *  (sin esto) fallaba siempre por esto mismo. `data-vaul-no-drag` es el
 *  escape hatch que el propio vaul expone para marcar un elemento (y sus
 *  hijos) como excluido de ese gesto; sin él, da igual qué tirador se use,
 *  vaul se queda con el toque antes de que framer-motion pueda arrancar. */
const SavedPlaceRow = ({
  place: p,
  isFirst,
  isLast,
  justMoved,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  place: SavedPlace;
  isFirst: boolean;
  isLast: boolean;
  /** Se acaba de mover con la flecha — un resalte breve para poder seguirlo
   *  de un vistazo a su fila nueva antes de tocar otra vez. Sin esto, cada
   *  toque sube/baja el sitio una fila y, si se toca varias veces seguidas
   *  en el mismo punto de la pantalla, se acaba moviendo OTRO sitio (el
   *  que haya quedado ahí), no el que se quería seguir moviendo. */
  justMoved: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: (id: string) => void;
}) => {
  const dragControls = useDragControls();
  const Icon = getSavedPlaceIcon(p);
  return (
    <Reorder.Item
      value={p}
      dragListener={false}
      dragControls={dragControls}
      className={cn(
        'glass rounded-xl p-3 flex items-center gap-3 transition-colors duration-500 bg-background',
        justMoved && 'ring-2 ring-primary bg-primary/10',
      )}
    >
      <button
        type="button"
        data-vaul-no-drag
        onPointerDown={(e) => dragControls.start(e)}
        aria-label={`Arrastrar ${p.label}`}
        className="shrink-0 -ml-1 p-2.5 text-muted-foreground/50 cursor-grab touch-none active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex flex-col shrink-0 -my-1">
        <button
          type="button"
          disabled={isFirst}
          onClick={onMoveUp}
          aria-label={`Subir ${p.label}`}
          className="p-1 text-muted-foreground disabled:opacity-25 disabled:pointer-events-none"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={onMoveDown}
          aria-label={`Bajar ${p.label}`}
          className="p-1 text-muted-foreground disabled:opacity-25 disabled:pointer-events-none"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
      <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{p.label}</p>
        <p className="text-xs text-muted-foreground truncate">{p.name}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="h-6 w-6 shrink-0"
        onClick={() => onRemove(p.id)}
        aria-label={`Borrar ${p.label}`}
      >
        <Trash2 className="w-3.5 h-3.5 text-destructive" />
      </Button>
    </Reorder.Item>
  );
};

const SavedPlacesSheet = ({ isOpen, onClose, currentLocation, places, initialKind }: SavedPlacesSheetProps) => {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<SavedPlaceKind>('home');
  const [otherLabel, setOtherLabel] = useState('');
  const [otherIcon, setOtherIcon] = useState(SAVED_PLACE_ICON_OPTIONS[0].id);
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimerRef = useRef<number | null>(null);

  const movePlace = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= places.places.length) return;
    const reordered = [...places.places];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    places.reorderPlaces(reordered);
    if (highlightTimerRef.current != null) window.clearTimeout(highlightTimerRef.current);
    setHighlightedId(reordered[target].id);
    highlightTimerRef.current = window.setTimeout(() => setHighlightedId(null), 900);
  };

  useEffect(() => () => {
    if (highlightTimerRef.current != null) window.clearTimeout(highlightTimerRef.current);
  }, []);

  const hasHome = places.places.some((p) => p.kind === 'home');
  const hasWork = places.places.some((p) => p.kind === 'work');

  useEffect(() => {
    if (isOpen && initialKind) {
      setKind(initialKind);
      setShowForm(true);
    }
  }, [isOpen, initialKind]);

  const resetForm = () => {
    setKind(hasHome ? (hasWork ? 'other' : 'work') : 'home');
    setOtherLabel('');
    setOtherIcon(SAVED_PLACE_ICON_OPTIONS[0].id);
    setPlace(null);
    setShowForm(false);
  };

  const openForm = () => {
    setKind(hasHome ? (hasWork ? 'other' : 'work') : 'home');
    setShowForm(true);
  };

  // Captura la ubicación real AHORA, igual que ya hace RecurringTripsSheet
  // para el punto de salida — se resuelve a una dirección legible con la
  // misma geocodificación que ya usa la app, en vez de guardar solo
  // "tu ubicación" sin ningún nombre reconocible.
  const handleUseCurrentLocation = async () => {
    if (!currentLocation) {
      toast({ title: 'Esperando tu ubicación GPS', description: 'Inténtalo de nuevo en unos segundos', duration: 2500 });
      return;
    }
    setLocating(true);
    const [lat, lng] = currentLocation;
    try {
      const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, language: 'es', limit: '1' });
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params.toString()}`);
      const data = await res.json();
      const name = data?.features?.[0]?.place_name ?? 'Tu ubicación actual';
      setPlace({ name, lat, lng });
    } catch {
      setPlace({ name: 'Tu ubicación actual', lat, lng });
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    if (!place) return;
    if (kind === 'other' && !otherLabel.trim()) return;
    setSaving(true);
    try {
      await places.addPlace({
        kind,
        label: kind === 'other' ? otherLabel.trim() : KIND_LABEL[kind],
        icon: kind === 'other' ? otherIcon : null,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
      });
      toast({ title: 'Sitio guardado', duration: 1800 });
      resetForm();
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : 'Inténtalo de nuevo',
        duration: 4000,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[85vh] bg-background border-border">
        <div className="overflow-y-auto px-4 pb-6">
          <DrawerHeader className="px-0 pt-2 pb-3">
            <DrawerTitle className="text-lg font-bold text-foreground">Lugares guardados</DrawerTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Casa, trabajo y otros sitios a los que vas a menudo — un toque bajo el buscador para ir directo.
            </p>
          </DrawerHeader>

          {!places.isAuthenticated ? (
            <div className="glass rounded-xl p-6 text-center">
              <p className="text-sm text-muted-foreground">Inicia sesión para guardar tus sitios.</p>
            </div>
          ) : (
            <>
              {!places.loading && places.places.length > 0 && (
                <Reorder.Group
                  axis="y"
                  values={places.places}
                  onReorder={places.reorderPlaces}
                  className="space-y-2 mb-4"
                >
                  {places.places.map((p, i) => (
                    <SavedPlaceRow
                      key={p.id}
                      place={p}
                      isFirst={i === 0}
                      isLast={i === places.places.length - 1}
                      justMoved={highlightedId === p.id}
                      onMoveUp={() => movePlace(i, -1)}
                      onMoveDown={() => movePlace(i, 1)}
                      onRemove={places.removePlace}
                    />
                  ))}
                </Reorder.Group>
              )}

              {showForm ? (
                <div className="glass rounded-xl p-3 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {(['home', 'work', 'other'] as SavedPlaceKind[]).map((k) => {
                      const disabled = (k === 'home' && hasHome) || (k === 'work' && hasWork);
                      return (
                        <button
                          key={k}
                          type="button"
                          disabled={disabled}
                          onClick={() => setKind(k)}
                          className={cn(
                            'py-2 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40',
                            kind === k ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground',
                          )}
                        >
                          {k === 'home' ? 'Casa' : k === 'work' ? 'Trabajo' : 'Otro'}
                        </button>
                      );
                    })}
                  </div>

                  {kind === 'other' && (
                    <>
                      <input
                        type="text"
                        value={otherLabel}
                        onChange={(e) => setOtherLabel(e.target.value)}
                        placeholder="Nombre (p. ej. Gimnasio)"
                        className="w-full px-3 py-2 bg-muted rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <div className="grid grid-cols-6 gap-2">
                        {SAVED_PLACE_ICON_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            aria-label={opt.label}
                            onClick={() => setOtherIcon(opt.id)}
                            className={cn(
                              'aspect-square rounded-lg border flex items-center justify-center transition-colors',
                              otherIcon === opt.id ? 'border-primary bg-primary/10' : 'border-border',
                            )}
                          >
                            <opt.icon className={cn('w-4 h-4', otherIcon === opt.id ? 'text-primary' : 'text-muted-foreground')} />
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="justify-start"
                      disabled={locating}
                      onClick={handleUseCurrentLocation}
                    >
                      {locating ? (
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      ) : (
                        <LocateFixed className="w-4 h-4 mr-1.5" />
                      )}
                      Mi ubicación
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="justify-start"
                      onClick={() => setShowMapPicker(true)}
                    >
                      <MapIcon className="w-4 h-4 mr-1.5" />
                      Elegir en el mapa
                    </Button>
                  </div>

                  {/* key fuerza a PlacePicker a remontar (y recoger el
                      nuevo initialValue) cuando el sitio se resuelve desde
                      el GPS en vez de escribirlo — si no, su input se
                      quedaría vacío aunque "place" ya tenga un valor. */}
                  <PlacePicker
                    key={place?.name ?? 'empty'}
                    placeholder="O busca una dirección..."
                    initialValue={place?.name ?? ''}
                    onSelect={setPlace}
                    userLocation={currentLocation}
                  />

                  <div className="flex gap-2 pt-1">
                    <Button variant="ghost" className="flex-1" onClick={resetForm} disabled={saving}>
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={saving || !place || (kind === 'other' && !otherLabel.trim())}
                      onClick={handleSave}
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={openForm}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Añadir sitio
                </Button>
              )}
            </>
          )}
        </div>
      </DrawerContent>

      {showMapPicker && (
        <Suspense fallback={null}>
          <MapLocationPicker
            isOpen={showMapPicker}
            onClose={() => setShowMapPicker(false)}
            onConfirm={(picked) => {
              setPlace(picked);
              setShowMapPicker(false);
            }}
            initialCenter={currentLocation}
          />
        </Suspense>
      )}
    </Drawer>
  );
};

export default SavedPlacesSheet;
