import { useState } from 'react';
import { Plus, Trash2, Clock, MapPin, Navigation, LocateFixed, Loader2, Repeat, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { MAPBOX_TOKEN } from '@/lib/mapboxConfig';
import { useRecurringTrips, type NewRecurringTrip } from '@/hooks/useRecurringTrips';
import { useScheduledTrips, type NewScheduledTrip } from '@/hooks/useScheduledTrips';
import PlacePicker, { type PickedPlace } from '@/components/PlacePicker';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

interface RecurringTripsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Destino puesto ahora mismo en el navegador — se usa para rellenar el
   *  formulario por defecto, como se pidió explícitamente. */
  currentDestination?: { name: string; lat: number; lng: number } | null;
  /** Ubicación GPS real, para "Usar mi ubicación actual" como punto de salida. */
  currentLocation?: [number, number] | null;
}

const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const DAY_FULL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function formatDays(days: number[]): string {
  if (days.length === 7) return 'Todos los días';
  const sorted = [...days].sort();
  // Lunes a viernes es el caso más común — lo reconoce como tal en vez de
  // enumerar los 5 días.
  if (sorted.length === 5 && [1, 2, 3, 4, 5].every((d) => sorted.includes(d))) return 'Lunes a viernes';
  return sorted.map((d) => DAY_LABELS[d]).join(', ');
}

function formatScheduledDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return `Hoy · ${time}`;
  if (diffDays === 1) return `Mañana · ${time}`;
  return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · ${time}`;
}

/** 'YYYY-MM-DDTHH:mm' en hora local, para el input datetime-local — mañana
 *  a las 9:00 por defecto. */
function defaultOnceValue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowLocalValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const RecurringTripsSheet = ({ isOpen, onClose, currentDestination, currentLocation }: RecurringTripsSheetProps) => {
  const { toast } = useToast();
  const recurring = useRecurringTrips();
  const scheduled = useScheduledTrips();
  const [showForm, setShowForm] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'weekly' | 'once'>('weekly');

  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [time, setTime] = useState('08:00');
  const [onceAt, setOnceAt] = useState(defaultOnceValue());
  const [destination, setDestination] = useState<PickedPlace | null>(
    currentDestination ? { name: currentDestination.name, lat: currentDestination.lat, lng: currentDestination.lng } : null,
  );
  const [origin, setOrigin] = useState<PickedPlace | null>(null);
  const [locatingOrigin, setLocatingOrigin] = useState(false);
  const [saving, setSaving] = useState(false);

  const isAuthenticated = recurring.isAuthenticated;

  // Captura la ubicación real AHORA (no un modo abstracto "en directo" sin
  // nada que mostrar) — se resuelve a una dirección legible con la misma
  // geocodificación que ya usa la app.
  const handleUseCurrentLocation = async () => {
    if (!currentLocation) {
      toast({ title: 'Esperando tu ubicación GPS', description: 'Inténtalo de nuevo en unos segundos', duration: 2500 });
      return;
    }
    setLocatingOrigin(true);
    const [lat, lng] = currentLocation;
    try {
      const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, language: 'es', limit: '1' });
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params.toString()}`);
      const data = await res.json();
      const name = data?.features?.[0]?.place_name ?? 'Tu ubicación actual';
      setOrigin({ name, lat, lng });
    } catch {
      setOrigin({ name: 'Tu ubicación actual', lat, lng });
    } finally {
      setLocatingOrigin(false);
    }
  };

  const toggleDay = (d: number) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  const resetForm = () => {
    setRepeatMode('weekly');
    setDays([1, 2, 3, 4, 5]);
    setTime('08:00');
    setOnceAt(defaultOnceValue());
    setDestination(
      currentDestination ? { name: currentDestination.name, lat: currentDestination.lat, lng: currentDestination.lng } : null,
    );
    setOrigin(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!destination) return;
    if (repeatMode === 'weekly' && days.length === 0) return;
    if (repeatMode === 'once' && !onceAt) return;
    setSaving(true);
    try {
      if (repeatMode === 'weekly') {
        const payload: NewRecurringTrip = {
          destinationName: destination.name,
          destinationLat: destination.lat,
          destinationLng: destination.lng,
          departureTime: time,
          daysOfWeek: days,
          ...(origin ? { originName: origin.name, originLat: origin.lat, originLng: origin.lng } : {}),
        };
        await recurring.addTrip(payload);
        toast({ title: 'Viaje habitual guardado', duration: 1800 });
      } else {
        const payload: NewScheduledTrip = {
          destinationName: destination.name,
          destinationLat: destination.lat,
          destinationLng: destination.lng,
          scheduledAt: new Date(onceAt).toISOString(),
          ...(origin ? { originName: origin.name, originLat: origin.lat, originLng: origin.lng } : {}),
        };
        await scheduled.addTrip(payload);
        toast({ title: 'Viaje programado', duration: 1800 });
      }
      resetForm();
    } catch (err) {
      // Antes este error se descartaba en silencio: el botón "Guardar"
      // parecía no hacer nada y el viaje no quedaba guardado en ningún sitio.
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
            <DrawerTitle className="text-lg font-bold text-foreground">Programar viaje</DrawerTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Trayectos que repites cada semana, o uno puntual para un día concreto.
            </p>
          </DrawerHeader>

          {!isAuthenticated ? (
            <div className="glass rounded-xl p-6 text-center">
              <p className="text-sm text-muted-foreground">Inicia sesión para programar tus viajes.</p>
            </div>
          ) : (
            <>
              {!recurring.loading && recurring.trips.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Viajes habituales
                  </p>
                  <div className="space-y-2">
                    {recurring.trips.map((t) => (
                      <div key={t.id} className="glass rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground truncate">{t.destinationName}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDays(t.daysOfWeek)} · {t.departureTime}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Navigation className="w-3 h-3 shrink-0" />
                              {t.originName ?? 'Desde tu ubicación en ese momento'}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={t.active}
                              onClick={() => recurring.toggleActive(t.id, !t.active)}
                              className={cn(
                                'w-9 h-5 rounded-full transition-colors relative shrink-0',
                                t.active ? 'bg-primary' : 'bg-muted-foreground/30',
                              )}
                            >
                              <span
                                className={cn(
                                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                                  t.active ? 'translate-x-[18px]' : 'translate-x-0.5',
                                )}
                              />
                            </button>
                            <Button variant="ghost" size="icon-sm" className="h-6 w-6" onClick={() => recurring.removeTrip(t.id)}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!scheduled.loading && scheduled.trips.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Viajes puntuales
                  </p>
                  <div className="space-y-2">
                    {scheduled.trips.map((t) => (
                      <div key={t.id} className="glass rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground truncate">{t.destinationName}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{formatScheduledDate(t.scheduledAt)}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Navigation className="w-3 h-3 shrink-0" />
                              {t.originName ?? 'Desde tu ubicación en ese momento'}
                            </p>
                          </div>
                          <Button variant="ghost" size="icon-sm" className="h-6 w-6 shrink-0" onClick={() => scheduled.cancelTrip(t.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!showForm ? (
                <Button variant="outline" className="w-full" onClick={() => setShowForm(true)}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Añadir viaje
                </Button>
              ) : (
                <div className="glass rounded-xl p-4 space-y-4">
                  <div className="flex gap-1.5 bg-muted/50 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => setRepeatMode('weekly')}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                        repeatMode === 'weekly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                      )}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      Se repite cada semana
                    </button>
                    <button
                      type="button"
                      onClick={() => setRepeatMode('once')}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                        repeatMode === 'once' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                      )}
                    >
                      <CalendarDays className="w-3.5 h-3.5" />
                      Solo una vez
                    </button>
                  </div>

                  {repeatMode === 'weekly' ? (
                    <>
                      <div>
                        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                          Días de la semana
                        </label>
                        <div className="flex gap-1.5">
                          {DAY_LABELS.map((label, d) => (
                            <button
                              key={d}
                              type="button"
                              aria-label={DAY_FULL[d]}
                              onClick={() => toggleDay(d)}
                              className={cn(
                                'w-9 h-9 rounded-full text-xs font-bold transition-colors',
                                days.includes(d)
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground',
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                          <Clock className="w-3.5 h-3.5" />
                          Hora de salida
                        </label>
                        <input
                          type="time"
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                          className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </>
                  ) : (
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                        <CalendarDays className="w-3.5 h-3.5" />
                        Fecha y hora
                      </label>
                      <input
                        type="datetime-local"
                        value={onceAt}
                        min={nowLocalValue()}
                        onChange={(e) => setOnceAt(e.target.value)}
                        className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  )}

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                      <MapPin className="w-3.5 h-3.5" />
                      Destino
                    </label>
                    <PlacePicker
                      placeholder="¿A dónde vas?"
                      initialValue={destination?.name ?? ''}
                      onSelect={setDestination}
                    />
                    {currentDestination && !destination && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Sugerencia: el destino que tienes puesto ahora, {currentDestination.name}.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                      Punto de salida
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full justify-start mb-2"
                      disabled={locatingOrigin}
                      onClick={handleUseCurrentLocation}
                    >
                      {locatingOrigin ? (
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      ) : (
                        <LocateFixed className="w-4 h-4 mr-1.5" />
                      )}
                      Usar mi ubicación actual
                    </Button>
                    <PlacePicker
                      placeholder="O busca una dirección fija..."
                      initialValue={origin?.name ?? ''}
                      onSelect={setOrigin}
                    />
                    {origin && (
                      <p className="text-[11px] text-muted-foreground mt-1 truncate">Saldrás desde: {origin.name}</p>
                    )}
                    {!origin && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Si no eliges nada, se recoge desde donde estés en ese momento.
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button variant="ghost" className="flex-1" onClick={resetForm} disabled={saving}>
                      Cancelar
                    </Button>
                    <Button
                      variant="driver"
                      className="flex-1"
                      onClick={handleSave}
                      disabled={saving || !destination || (repeatMode === 'weekly' ? days.length === 0 : !onceAt)}
                    >
                      Guardar
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default RecurringTripsSheet;
