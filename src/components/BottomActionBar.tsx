import { motion } from "framer-motion";
import { Settings, Locate, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import DriverToggle from "@/components/DriverToggle";
import PassengerToggle from "@/components/PassengerToggle";
import { OVERLAY_BOTTOM_PX, overlayBottom } from "@/lib/overlayLayout";

interface BottomActionBarProps {
  /** Show the "Iniciar conducción" CTA (route exists, user hasn't started moving yet). */
  showStartDrivingCta: boolean;
  onStartDriving: () => void;
  isDriverMode: boolean;
  onDriverToggle: () => void;
  onOpenDriverSettings: () => void;
  isPassengerMode: boolean;
  onPassengerToggle: () => void;
  onOpenPassengerSettings: () => void;
}

/** Bottom overlay: the "start driving" CTA; the driver/passenger mode
 * toggles and the zoom/locate controls — ALWAYS in the same fixed spots,
 * whether idle or mid-trip, per explicit instruction. Purely
 * presentational: all state lives in the parent. */
const BottomActionBar = ({
  showStartDrivingCta,
  onStartDriving,
  isDriverMode,
  onDriverToggle,
  onOpenDriverSettings,
  isPassengerMode,
  onPassengerToggle,
  onOpenPassengerSettings,
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
      <div className="fixed left-3 z-30 pointer-events-none" style={{ bottom: overlayBottom(OVERLAY_BOTTOM_PX.cornerControls) }}>
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

      {/* Zoom/centrar — SIEMPRE visibles, haya o no viaje activo, fijos en
          la esquina inferior derecha debajo de las chapas de pasajero
          (que empiezan en bottom:160) — antes desaparecían del todo con
          un viaje activo, igual que les pasaba antes a los toggles de
          modo. */}
      <div className="fixed right-3 z-30 pointer-events-none" style={{ bottom: overlayBottom(OVERLAY_BOTTOM_PX.cornerControls) }}>
        <div className="flex flex-col gap-1 pointer-events-auto">
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
    </>
  );
};

export default BottomActionBar;
