import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import type { useSavedPlaces, SavedPlaceKind } from '@/hooks/useSavedPlaces';
import { SAVED_PLACE_ICON_OPTIONS, getSavedPlaceIcon } from '@/lib/savedPlaceIcons';
import PlacePicker, { type PickedPlace } from '@/components/PlacePicker';
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

const SavedPlacesSheet = ({ isOpen, onClose, currentLocation, places, initialKind }: SavedPlacesSheetProps) => {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<SavedPlaceKind>('home');
  const [otherLabel, setOtherLabel] = useState('');
  const [otherIcon, setOtherIcon] = useState(SAVED_PLACE_ICON_OPTIONS[0].id);
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [saving, setSaving] = useState(false);

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
                <div className="space-y-2 mb-4">
                  {places.places.map((p) => {
                    const Icon = getSavedPlaceIcon(p);
                    return (
                      <div key={p.id} className="glass rounded-xl p-3 flex items-center gap-3">
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
                          onClick={() => places.removePlace(p.id)}
                          aria-label={`Borrar ${p.label}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
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

                  <PlacePicker placeholder="Buscar dirección..." onSelect={setPlace} userLocation={currentLocation} />

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
    </Drawer>
  );
};

export default SavedPlacesSheet;
