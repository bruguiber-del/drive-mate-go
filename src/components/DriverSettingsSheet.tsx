import { useState, useCallback } from 'react';
import { Users, Timer, PawPrint, Baby, MapPin, User, Euro, Save, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PET_SURCHARGE, CHILD_SEAT_SURCHARGE, DOOR_TO_DOOR_SURCHARGE } from '@/lib/priceCalculator';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';

export interface DriverSettingsData {
  seats: number;
  maxDetour: number;
  doorToDoor: boolean;
  acceptsPets: boolean;
  hasChildSeat: boolean;
  genderPreference: 'none' | 'women' | 'men';
}

interface DriverSettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: DriverSettingsData) => void;
  /** Ajustes ya guardados — sin esto, el panel se reiniciaba a los valores
   *  por defecto cada vez que se abría, aunque ya se hubiera guardado algo. */
  initialSettings?: DriverSettingsData;
}

const DriverSettingsSheet = ({ isOpen, onClose, onSave, initialSettings }: DriverSettingsSheetProps) => {
  const [seats, setSeats] = useState(initialSettings?.seats ?? 3);
  const [maxDetour, setMaxDetour] = useState(initialSettings?.maxDetour ?? 5);
  const [doorToDoor, setDoorToDoor] = useState(initialSettings?.doorToDoor ?? true);
  const [acceptsPets, setAcceptsPets] = useState(initialSettings?.acceptsPets ?? false);
  const [hasChildSeat, setHasChildSeat] = useState(initialSettings?.hasChildSeat ?? false);
  const [genderPreference, setGenderPreference] = useState<'none' | 'women' | 'men'>(
    initialSettings?.genderPreference ?? 'none',
  );

  const handleSave = useCallback(() => {
    onSave({ seats, maxDetour, doorToDoor, acceptsPets, hasChildSeat, genderPreference });
    onClose();
  }, [seats, maxDetour, doorToDoor, acceptsPets, hasChildSeat, genderPreference, onSave, onClose]);

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[85vh] bg-background border-border">
        <div className="overflow-y-auto px-4 pb-2">
          <DrawerHeader className="px-0 pt-2 pb-3">
            <DrawerTitle className="text-lg font-bold text-foreground">Ajustes de conductor</DrawerTitle>
          </DrawerHeader>

          {/* Section 1: Compensation - TOP PRIORITY */}
          <div className="bg-gradient-to-r from-success/20 to-primary/20 rounded-xl p-3 mb-4">
            <div className="flex items-center gap-2 mb-0.5">
              <Euro className="w-4 h-4 text-success" />
              <p className="text-xs text-muted-foreground">Compensación estimada por compartir gastos hoy</p>
            </div>
            <p className="text-xl font-bold text-foreground">4 - 8€ <span className="text-xs font-normal text-muted-foreground">por persona</span></p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Después de la comisión del 12% de la app</p>
          </div>

          {/* Seats - Compact segmented control */}
          <div className="mb-4">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
              <Users className="w-3.5 h-3.5" />
              Plazas disponibles
            </label>
            <div className="flex gap-1.5 bg-muted/50 rounded-lg p-1">
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  onClick={() => setSeats(num)}
                  className={cn(
                    "flex-1 py-2 rounded-md text-sm font-bold transition-all",
                    seats === num
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Max Detour - Compact */}
          <div className="mb-4">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
              <Timer className="w-3.5 h-3.5" />
              Desvío máximo: <span className="text-foreground font-bold">+{maxDetour} min</span>
            </label>
            <input
              type="range"
              min={2}
              max={15}
              value={maxDetour}
              onChange={(e) => setMaxDetour(Number(e.target.value))}
              className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>2 min</span>
              <span>15 min</span>
            </div>
          </div>

          {/* Section 2: Trip Preferences */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Preferencias del viaje</p>

          {/* Compact toggle rows ~60px */}
          <button
            onClick={() => setAcceptsPets(!acceptsPets)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1.5 transition-all",
              acceptsPets
                ? "bg-primary/10 border border-primary/30"
                : "bg-muted/50 border border-transparent"
            )}
          >
            <PawPrint className={cn("w-4 h-4 shrink-0", acceptsPets ? "text-primary" : "text-muted-foreground")} />
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight">Acepto mascotas</p>
              <p className="text-[11px] text-muted-foreground">Recargo +{PET_SURCHARGE.toFixed(0)}€ automático</p>
            </div>
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
              acceptsPets ? "border-primary bg-primary" : "border-muted-foreground/40"
            )}>
              {acceptsPets && <div className="w-2.5 h-2.5 bg-primary-foreground rounded-full" />}
            </div>
          </button>

          <button
            onClick={() => setHasChildSeat(!hasChildSeat)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1.5 transition-all",
              hasChildSeat
                ? "bg-secondary/10 border border-secondary/30"
                : "bg-muted/50 border border-transparent"
            )}
          >
            <Baby className={cn("w-4 h-4 shrink-0", hasChildSeat ? "text-secondary" : "text-muted-foreground")} />
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight">Silla infantil</p>
              <p className="text-[11px] text-muted-foreground">Recargo +{CHILD_SEAT_SURCHARGE.toFixed(0)}€ automático</p>
            </div>
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
              hasChildSeat ? "border-secondary bg-secondary" : "border-muted-foreground/40"
            )}>
              {hasChildSeat && <div className="w-2.5 h-2.5 bg-secondary-foreground rounded-full" />}
            </div>
          </button>

          {hasChildSeat && (
            <p className="text-[10px] text-muted-foreground mb-1.5 px-3">
              ⚠️ El conductor es responsable del uso correcto del sistema de retención infantil.
            </p>
          )}

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
              <p className="text-[11px] text-muted-foreground">Recargo +{DOOR_TO_DOOR_SURCHARGE.toFixed(2)}€ automático</p>
            </div>
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
              doorToDoor ? "border-success bg-success" : "border-muted-foreground/40"
            )}>
              {doorToDoor && <div className="w-2.5 h-2.5 bg-success-foreground rounded-full" />}
            </div>
          </button>

          {doorToDoor && (
            <div className="flex items-start gap-1.5 px-3 mb-2">
              <Info className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground">
                Se suma automáticamente al precio de cada viaje con recogida puerta a puerta.
              </p>
            </div>
          )}

          {/* Section 3: Passenger Preferences */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-3">Preferencia de pasajero</p>

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

        {/* Sticky save button */}
        <DrawerFooter className="px-4 pt-2 pb-4 border-t border-border">
          <Button variant="driver" size="lg" className="w-full" onClick={handleSave}>
            <Save className="w-4 h-4 mr-1.5" />
            Guardar ajustes
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default DriverSettingsSheet;
