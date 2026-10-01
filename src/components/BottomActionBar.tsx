import { motion } from "framer-motion";
import { Settings, Locate, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import DriverToggle from "@/components/DriverToggle";
import PassengerToggle from "@/components/PassengerToggle";

interface BottomActionBarProps {
  /** Show the "Iniciar conducción" CTA (route exists, user hasn't started moving yet). */
  showStartDrivingCta: boolean;
  onStartDriving: () => void;
  /** Hide SOLO el ETA/zoom/locate mientras hay un viaje activo — esos sí
   *  chocarían con la tarjeta de viaje y el total compensado, que ocupan
   *  esa misma franja de abajo a la derecha/centro. Los toggles de modo
   *  (ver más abajo) ya NO dependen de esto en absoluto: van siempre en
   *  el mismo sitio fijo, haya o no viaje activo. */
  showBar: boolean;
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
 * toggles — ALWAYS in the same fixed left-side spot, below the "add stop"
 * search button, whether idle or mid-trip, per explicit instruction; and
 * — unless a trip is active — the live ETA chip and the zoom/locate
 * controls. Purely presentational: all state lives in the parent. */
const BottomActionBar = ({
  showStartDrivingCta,
  onStartDriving,
  showBar,
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

      {/* Toggles de modo — SIEMPRE en el mismo sitio fijo (lateral
          izquierdo, justo DEBAJO de la lupa de "añadir parada"), haya o no
          viaje activo. Antes tenían dos layouts distintos según el estado
          y saltaban de uno a otro — ahora es uno solo, constante, tal y
          como se pidió explícitamente ("fijos siempre ahí... hasta que me
          digas lo contrario"). La tarjeta de viaje/botón de cancelar se
          movieron al centro para dejar esta columna libre solo para esto. */}
      <div className="fixed left-3 z-30 pointer-events-none" style={{ bottom: 20 }}>
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

      {/* ETA + zoom/locate — se sigue ocultando con un viaje activo (ahí sí
          chocaría con la tarjeta de viaje y el total compensado). */}
      {showBar && (
        <motion.div
          className="absolute bottom-0 right-0 p-3 pb-6 safe-area-inset-bottom pointer-events-none"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-2 pointer-events-auto">
            {isNavigating && dynamicETA && (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="min-w-0">
                <div className="glass-strong rounded-lg px-2 py-1.5 flex items-center gap-2">
                  <Navigation className="w-3 h-3 text-primary shrink-0" />
                  <span className="text-xs text-foreground truncate">{destination}</span>
                  <span className="text-xs font-bold text-primary shrink-0">· {dynamicETA.minutes} min</span>
                </div>
              </motion.div>
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
    </>
  );
};

export default BottomActionBar;
