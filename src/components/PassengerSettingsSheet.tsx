import { useState, useCallback, useEffect } from 'react';
import { Users, PawPrint, Baby, MapPin, User, Info, Clock, Navigation2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PET_SURCHARGE, CHILD_SEAT_SURCHARGE } from '@/lib/priceCalculator';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface PassengerSettingsData {
  spacePreference: 'none' | 'spacious-car' | 'spacious-front';
  seatsNeeded: number;
  hasPet: boolean;
  needsChildSeat: boolean;
  doorToDoor: boolean;
  genderPreference: 'none' | 'women' | 'men';
  /** Origen editable (por defecto el GPS real del usuario) */
  originText: string;
  /** El viaje es para otra persona */
  isForOther: boolean;
  otherPersonName: string;
  otherPersonPickup: string;
  /** 'now' busca conductor al instante; 'scheduled' espera a la hora */
  scheduleMode: 'now' | 'scheduled';
  /** ISO string cuando scheduleMode === 'scheduled' */
  scheduledAt: string | null;
}

interface PassengerSettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: PassengerSettingsData) => void;
  /** GPS real del usuario [lat, lng] — rellena "Tu ubicación" automáticamente */
  userLocation?: [number, number] | null;
  /** Preferencias ya guardadas — sin esto, el panel se reiniciaba a los
   *  valores por defecto cada vez que se abría. */
  initialPreferences?: {
    hasPet: boolean;
    needsChildSeat: boolean;
    doorToDoor: boolean;
    genderPreference: 'none' | 'women' | 'men';
  };
}

const PassengerSettingsSheet = ({ isOpen, onClose, onSave, userLocation, initialPreferences }: PassengerSettingsSheetProps) => {
  const [spacePreference, setSpacePreference] = useState<'none' | 'spacious-car' | 'spacious-front'>('none');
  const [seatsNeeded, setSeatsNeeded] = useState(1);
  const [hasPet, setHasPet] = useState(initialPreferences?.hasPet ?? false);
  const [needsChildSeat, setNeedsChildSeat] = useState(initialPreferences?.needsChildSeat ?? false);
  const [doorToDoor, setDoorToDoor] = useState(initialPreferences?.doorToDoor ?? false);
  const [genderPreference, setGenderPreference] = useState<'none' | 'women' | 'men'>(
    initialPreferences?.genderPreference ?? 'none',
  );

  // ── Origen / para otra persona / programar ────────────────────────────────
  const [originText, setOriginText] = useState('');
  const [originEdited, setOriginEdited] = useState(false);
  const [isForOther, setIsForOther] = useState(false);
  const [otherPersonName, setOtherPersonName] = useState('');
  const [otherPersonPickup, setOtherPersonPickup] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  // Autorrelleno con el GPS real mientras el usuario no lo haya editado a mano
  useEffect(() => {
    if (originEdited || !userLocation) return;
    setOriginText(`${userLocation[0].toFixed(5)}, ${userLocation[1].toFixed(5)}`);
  }, [userLocation, originEdited]);

  const handleSave = useCallback(() => {
    let scheduledAt: string | null = null;
    if (scheduleMode === 'scheduled' && scheduledDate && scheduledTime) {
      const parsed = new Date(`${scheduledDate}T${scheduledTime}`);
      if (!isNaN(parsed.getTime())) scheduledAt = parsed.toISOString();
    }
    onSave({
      spacePreference,
      seatsNeeded,
      hasPet,
      needsChildSeat,
      doorToDoor,
      genderPreference,
      originText,
      isForOther,
      otherPersonName,
      otherPersonPickup,
      scheduleMode: scheduledAt ? 'scheduled' : 'now',
      scheduledAt,
    });
    onClose();
  }, [
    spacePreference, seatsNeeded, hasPet, needsChildSeat, doorToDoor, genderPreference,
    originText, isForOther, otherPersonName, otherPersonPickup, scheduleMode,
    scheduledDate, scheduledTime, onSave, onClose,
  ]);

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[85vh] bg-background border-border">
        <div className="overflow-y-auto px-4 pb-2">
          <DrawerHeader className="px-0 pt-2 pb-3">
            <DrawerTitle className="text-lg font-bold text-foreground">Preferencias de viaje</DrawerTitle>
          </DrawerHeader>

          {/* Section 0: Origen, para quién y cuándo */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tu viaje</p>

          <div className="mb-3">
            <label htmlFor="passenger-origin" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <Navigation2 className="w-3.5 h-3.5" />
              Tu ubicación
            </label>
            <Input
              id="passenger-origin"
              value={originText}
              placeholder="Detectando tu ubicación…"
              onChange={(e) => { setOriginEdited(true); setOriginText(e.target.value); }}
            />
            <p className="text-[10px] text-muted-foreground mt-1 px-1">
              Se rellena con tu GPS, pero puedes escribir otra dirección.
            </p>
          </div>

          <button
            onClick={() => setIsForOther(!isForOther)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1.5 transition-all",
              isForOther ? "bg-primary/10 border border-primary/30" : "bg-muted/50 border border-transparent"
            )}
          >
            <User className={cn("w-4 h-4 shrink-0", isForOther ? "text-primary" : "text-muted-foreground")} />
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight">Es para otra persona</p>
              <p className="text-[11px] text-muted-foreground">
                {isForOther ? 'Pediremos el viaje a nombre de otra persona' : 'El viaje es para ti'}
              </p>
            </div>
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
              isForOther ? "border-primary bg-primary" : "border-muted-foreground/40"
            )}>
              {isForOther && <div className="w-2.5 h-2.5 bg-primary-foreground rounded-full" />}
            </div>
          </button>

          {isForOther && (
            <div className="space-y-2 mb-3 px-1">
              <Input
                aria-label="Nombre de la persona"
                placeholder="Nombre de la persona"
                value={otherPersonName}
                onChange={(e) => setOtherPersonName(e.target.value)}
              />
              <Input
                aria-label="Punto de recogida"
                placeholder="Punto de recogida"
                value={otherPersonPickup}
                onChange={(e) => setOtherPersonPickup(e.target.value)}
              />
            </div>
          )}

          <div className="mb-4">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <Clock className="w-3.5 h-3.5" />
              ¿Cuándo?
            </label>
            <div className="flex gap-1.5 bg-muted/50 rounded-lg p-1">
              {([
                { value: 'now' as const, label: 'Ahora' },
                { value: 'scheduled' as const, label: 'Programar' },
              ]).map((option) => (
                <button
                  key={option.value}
                  onClick={() => setScheduleMode(option.value)}
                  className={cn(
                    "flex-1 py-2 rounded-md text-sm font-bold transition-all",
                    scheduleMode === option.value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {scheduleMode === 'scheduled' && (
              <div className="flex gap-2 mt-2">
                <Input
                  aria-label="Fecha"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
                <Input
                  aria-label="Hora"
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Section 1: Comfort Preferences */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Preferencias de comodidad</p>


          <div className="flex flex-col gap-1.5 mb-4">
            {[
              { value: 'none' as const, label: 'Me da igual el espacio', surcharge: '+0€' },
              { value: 'spacious-car' as const, label: 'Coche amplio', surcharge: '+0,50€' },
              { value: 'spacious-front' as const, label: 'Asiento delantero amplio', surcharge: '+1€' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setSpacePreference(option.value)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all",
                  spacePreference === option.value
                    ? "bg-primary/10 border border-primary/30"
                    : "bg-muted/50 border border-transparent"
                )}
              >
                <div className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                  spacePreference === option.value ? "border-primary bg-primary" : "border-muted-foreground/40"
                )}>
                  {spacePreference === option.value && <div className="w-2.5 h-2.5 bg-primary-foreground rounded-full" />}
                </div>
                <span className="flex-1 text-left text-sm font-medium text-foreground">{option.label}</span>
                <span className={cn(
                  "text-xs font-semibold shrink-0",
                  spacePreference === option.value ? "text-primary" : "text-muted-foreground"
                )}>{option.surcharge}</span>
              </button>
            ))}
          </div>

          {/* Section 2: Seats needed */}
          <div className="mb-4">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
              <Users className="w-3.5 h-3.5" />
              Plazas que necesito
            </label>
            <div className="flex gap-1.5 bg-muted/50 rounded-lg p-1">
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  onClick={() => setSeatsNeeded(num)}
                  className={cn(
                    "flex-1 py-2 rounded-md text-sm font-bold transition-all",
                    seatsNeeded === num
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Trip Preferences */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Preferencias del viaje</p>

          <button
            onClick={() => setHasPet(!hasPet)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1.5 transition-all",
              hasPet
                ? "bg-primary/10 border border-primary/30"
                : "bg-muted/50 border border-transparent"
            )}
          >
            <PawPrint className={cn("w-4 h-4 shrink-0", hasPet ? "text-primary" : "text-muted-foreground")} />
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight">Llevo mascota</p>
              <p className="text-[11px] text-muted-foreground">Recargo +{PET_SURCHARGE.toFixed(0)}€ automático</p>
            </div>
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
              hasPet ? "border-primary bg-primary" : "border-muted-foreground/40"
            )}>
              {hasPet && <div className="w-2.5 h-2.5 bg-primary-foreground rounded-full" />}
            </div>
          </button>

          <button
            onClick={() => setNeedsChildSeat(!needsChildSeat)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1.5 transition-all",
              needsChildSeat
                ? "bg-secondary/10 border border-secondary/30"
                : "bg-muted/50 border border-transparent"
            )}
          >
            <Baby className={cn("w-4 h-4 shrink-0", needsChildSeat ? "text-secondary" : "text-muted-foreground")} />
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight">Necesito silla infantil</p>
              <p className="text-[11px] text-muted-foreground">Recargo +{CHILD_SEAT_SURCHARGE.toFixed(0)}€ automático</p>
            </div>
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
              needsChildSeat ? "border-secondary bg-secondary" : "border-muted-foreground/40"
            )}>
              {needsChildSeat && <div className="w-2.5 h-2.5 bg-secondary-foreground rounded-full" />}
            </div>
          </button>

          <button
            onClick={() => setDoorToDoor(!doorToDoor)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1.5 transition-all",
              doorToDoor
                ? "bg-success/10 border border-success/30"
                : "bg-muted/50 border border-transparent"
            )}
          >
            <MapPin className={cn("w-4 h-4 shrink-0", doorToDoor ? "text-success" : "text-muted-foreground")} />
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight">Puerta a puerta</p>
              <p className="text-[11px] text-muted-foreground">Recargo adicional por desvío</p>
            </div>
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
              doorToDoor ? "border-success bg-success" : "border-muted-foreground/40"
            )}>
              {doorToDoor && <div className="w-2.5 h-2.5 bg-success-foreground rounded-full" />}
            </div>
          </button>

          {/* Section 4: Driver Preference */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-3">
            Preferencia de conductor
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 inline-block ml-1 cursor-help align-middle" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Filtra coincidencias; no es obligatoria.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </p>

          <div className="flex gap-1.5 bg-muted/50 rounded-lg p-1 mb-1">
            {[
              { value: 'none', label: 'Indiferente' },
              { value: 'women', label: 'Solo mujeres' },
              { value: 'men', label: 'Solo hombres' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setGenderPreference(option.value as 'none' | 'women' | 'men')}
                className={cn(
                  "flex-1 py-2 px-1 rounded-md text-xs font-medium transition-all",
                  genderPreference === option.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground px-1 mb-2">
            Filtra coincidencias; no es obligatoria.
          </p>
        </div>

        <DrawerFooter className="px-4 pt-2 pb-4 border-t border-border">
          <Button variant="passenger" size="lg" className="w-full" onClick={handleSave}>
            Aplicar preferencias
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default PassengerSettingsSheet;
