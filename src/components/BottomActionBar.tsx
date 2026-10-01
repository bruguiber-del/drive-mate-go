import { motion } from "framer-motion";
import { Settings, Locate, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import DriverToggle from "@/components/DriverToggle";
import PassengerToggle from "@/components/PassengerToggle";

interface BottomActionBarProps {
  /** Show the "Iniciar conducción" CTA (route exists, user hasn't started moving yet). */
  showStartDrivingCta: boolean;
  onStartDriving: () => void;
  /** Hide el ETA/zoom/locate mientras hay un viaje activo — esos sí
   *  chocarían con la tarjeta de viaje y el total compensado, que ocupan
   *  esa misma franja de abajo. Los toggles de modo ya no dependen de
   *  esto (ver tripActive): se quedan visibles siempre, solo cambian de
   *  sitio. */
  showBar: boolean;
  /** true mientras hay un viaje activo — mueve los toggles de modo (y sus
   *  engranajes) a una columna junto a la lupa de "añadir parada" (misma
   *  esquina, por encima), para que sigan visibles sin pisar la tarjeta
   *  de viaje ni el total compensado que ocupan el resto de esa franja. */
  tripActive: boolean;
  isDriverMode: boolean;
  onDriverToggle: () => void;
  onOpenDriverSettings: () => void;
  isPassengerMode: boolean;
  onPassengerToggle: () => void;
  onOpenPassengerSettings: () => void;
  isNavigating: boolean;
  dynamicETA: { minutes: number } | null;
  destination: string;
}

/** Bottom overlay: the "start driving" CTA; the driver/passenger mode
 * toggles (always visible — in the normal row when idle, moved to a
 * left-side column during an active trip so they don't collide with
 * trip-specific controls); and — unless a trip is active — the live ETA
 * chip and the zoom/locate controls. Purely presentational: all state
 * lives in the parent. */
const BottomActionBar = ({
  showStartDrivingCta,
  onStartDriving,
  showBar,
  tripActive,
  isDriverMode,
  onDriverToggle,
  onOpenDriverSettings,
  isPassengerMode,
  onPassengerToggle,
  onOpenPassengerSettings,
  isNavigating,
  dynamicETA,
  destination,
}: BottomActionBarProps) => {
  return (
    <>
      {showStartDrivingCta && (
        <motion.div
          className="absolute bottom-28 left-4 right-4 pointer-events-auto z-20"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
        >
          <Button variant="default" size="lg" className="w-full shadow-float" onClick={onStartDriving}>
            <Navigation className="w-5 h-5 mr-2" />
            Iniciar conducción
          </Button>
        </motion.div>
      )}

      {/* Fila de siempre: toggles + ETA + zoom/locate juntos — sin cambios
          respecto a antes. Se oculta entera con un viaje activo (ver más
          abajo la versión en columna para ese caso). */}
      {showBar && !tripActive && (
        <motion.div
          className="absolute bottom-0 left-0 right-0 p-3 pb-6 safe-area-inset-bottom pointer-events-none"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-2 pointer-events-auto">
            <DriverToggle isDriver={isDriverMode} onToggle={onDriverToggle} />

            {isDriverMode && (
              <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}>
                <Button variant="glass" size="icon" className="w-9 h-9" onClick={onOpenDriverSettings}>
                  <Settings className="w-4 h-4" />
                </Button>
              </motion.div>
            )}

            <PassengerToggle isPassenger={isPassengerMode} onToggle={onPassengerToggle} />

            {isPassengerMode && (
              <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}>
                <Button variant="glass" size="icon" className="w-9 h-9" onClick={onOpenPassengerSettings}>
                  <Settings className="w-4 h-4" />
                </Button>
              </motion.div>
            )}

            {isNavigating && dynamicETA ? (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex-1 min-w-0">
                <div className="glass-strong rounded-lg px-2 py-1.5 flex items-center gap-2">
                  <Navigation className="w-3 h-3 text-primary shrink-0" />
                  <span className="text-xs text-foreground truncate">{destination}</span>
                  <span className="text-xs font-bold text-primary shrink-0">· {dynamicETA.minutes} min</span>
                </div>
              </motion.div>
            ) : (
              <div className="flex-1" />
            )}

            <div className="flex flex-col gap-1">
              <Button variant="glass" size="icon" className="w-8 h-8" onClick={() => (window as any).__mapZoomIn?.()}>
                <span className="text-sm font-bold text-foreground">+</span>
              </Button>
              <Button variant="glass" size="icon" className="w-8 h-8" onClick={() => (window as any).__mapZoomOut?.()}>
                <span className="text-sm font-bold text-foreground">−</span>
              </Button>
              <Button variant="glass" size="icon" className="w-8 h-8" onClick={() => (window as any).__mapCenterOnUser?.()}>
                <Locate className="w-4 h-4 text-primary" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Viaje activo: los toggles no desaparecen, se suben en columna
          justo encima de la lupa de "añadir parada" (misma esquina
          inferior izquierda) — lejos de la tarjeta de viaje y el total
          compensado, que siguen teniendo toda la franja de abajo libre. */}
      {tripActive && (
        <div className="fixed left-3 z-30 pointer-events-none" style={{ bottom: 185 }}>
          <div className="flex flex-col items-start gap-2 pointer-events-auto">
            <div className="flex items-center gap-2">
              <DriverToggle isDriver={isDriverMode} onToggle={onDriverToggle} />
              {isDriverMode && (
                <Button variant="glass" size="icon" className="w-9 h-9" onClick={onOpenDriverSettings}>
                  <Settings className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <PassengerToggle isPassenger={isPassengerMode} onToggle={onPassengerToggle} />
              {isPassengerMode && (
                <Button variant="glass" size="icon" className="w-9 h-9" onClick={onOpenPassengerSettings}>
                  <Settings className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BottomActionBar;
