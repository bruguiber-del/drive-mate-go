import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Navigation } from "lucide-react";
import { formatDistance } from "@/lib/format";
import type { RouteStep } from "@/hooks/useRouting";
import type { TripLeg } from "@/hooks/useWaypoints";

const LEG_LABELS: Record<TripLeg, string> = {
  to_meeting_point: "Ve a recoger al pasajero",
  to_pickup: "Ve a recoger al pasajero",
  to_dropoff: "Lleva al pasajero a su destino",
  to_destination: "Continúa a tu destino",
};

const ROUNDABOUT_TYPES = new Set(["roundabout", "rotary", "roundabout turn"]);

/** Insignia con el nº de salida sobre el icono de rotonda — a golpe de
 *  vista, sin tener que leer la frase completa de Mapbox. */
const ManeuverBadge = ({
  ManeuverIcon,
  step,
  size = "lg",
}: {
  ManeuverIcon: LucideIcon;
  step: RouteStep;
  size?: "lg" | "md";
}) => {
  const exit = ROUNDABOUT_TYPES.has(step.maneuver.type.toLowerCase()) ? step.maneuver.exit : undefined;
  const box = size === "lg" ? "w-14 h-14 rounded-xl" : "w-11 h-11 rounded-lg";
  const icon = size === "lg" ? "w-8 h-8" : "w-6 h-6";
  return (
    <div className={`relative ${box} bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/30`}>
      <ManeuverIcon className={`${icon} text-primary-foreground`} strokeWidth={2.5} />
      {exit != null && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-warning text-warning-foreground text-[10px] font-bold flex items-center justify-center border-2 border-background">
          {exit}
        </span>
      )}
    </div>
  );
};

interface NavigationOverlaysProps {
  isNavigating: boolean;
  showActiveTrip: boolean;
  isDriverMode: boolean;
  activeTripRole: "driver" | "passenger";
  hasPassenger: boolean;
  hasStartedDriving: boolean;
  currentStep: RouteStep | null;
  ManeuverIcon: LucideIcon;
  currentLeg: TripLeg;
  currentTargetName: string | null;
  dynamicETA: { minutes: number; distanceKm?: string } | null;
  detourMinutes: number | null;
  driverSeats: number;
  driverMaxDetour: number;
  activeVehiclePlate?: string;
}

/** All the status chips/banners shown over the map depending on driving
 * state — logo, driver status, turn-by-turn, active-trip phase, and the
 * passenger walking chip. Purely presentational; the parent decides what
 * state means what, this just renders it. */
const NavigationOverlays = ({
  isNavigating,
  showActiveTrip,
  isDriverMode,
  activeTripRole,
  hasPassenger,
  hasStartedDriving,
  currentStep,
  ManeuverIcon,
  currentLeg,
  currentTargetName,
  dynamicETA,
  detourMinutes,
  driverSeats,
  driverMaxDetour,
  activeVehiclePlate,
}: NavigationOverlaysProps) => {
  return (
    <>
      {/* Logo */}
      <AnimatePresence>
        {!isNavigating && !showActiveTrip && (
          <motion.div
            className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ delay: 0.4 }}
          >
            <h1 className="text-3xl font-extrabold tracking-tight">
              <span className="text-gradient">VI</span>
              <span className="text-foreground">MATCH</span>
            </h1>
            <p className="text-center text-sm text-muted-foreground mt-1">El navegador social</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Driver Status Chip */}
      {isDriverMode && !showActiveTrip && (
        <motion.div
          className="absolute top-16 right-4 pointer-events-none z-10"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="glass-strong rounded-full px-2.5 py-1 flex items-center gap-1 border border-success/30">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] font-medium text-foreground">Conductor activo</span>
            <span className="text-[10px] text-muted-foreground">
              · {driverSeats} plazas · +{driverMaxDetour} min
              {activeVehiclePlate ? ` · ${activeVehiclePlate}` : ""}
            </span>
          </div>
        </motion.div>
      )}

      {/* Estado compacto — conductor con pasajero, sin navegación giro a giro */}
      {showActiveTrip && activeTripRole === "driver" && hasPassenger && !(hasStartedDriving && currentStep) && (
        <motion.div
          className="absolute top-16 left-4 right-4 pointer-events-none z-10"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="glass-strong rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 border border-primary/20">
            <Navigation className="w-3.5 h-3.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-medium text-foreground">{LEG_LABELS[currentLeg]}</span>
              {currentTargetName && (
                <span className="text-[11px] text-muted-foreground ml-1 truncate">· {currentTargetName}</span>
              )}
            </div>
            <div className="text-right shrink-0">
              {dynamicETA && <span className="text-xs font-bold text-primary">{dynamicETA.minutes} min</span>}
              {detourMinutes != null && detourMinutes > 0 && (
                <span className="text-[9px] text-warning ml-1">+{detourMinutes} min desvío</span>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Turn-by-turn banner — SOLO cuando navegando SIN viaje activo. La
          distancia de la maniobra es el dato grande (como Waze/Google
          Maps): es lo que se lee de un vistazo conduciendo, la frase
          completa queda debajo más pequeña. A la derecha, lo que queda de
          TODO el trayecto (km y min), que va bajando según avanzas — antes
          no se enseñaba en ningún sitio arriba. */}
      {isNavigating && hasStartedDriving && !showActiveTrip && currentStep && (
        <motion.div
          className="absolute top-16 left-4 right-4 pointer-events-none z-10"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="glass-strong rounded-xl px-3 py-2.5 flex items-center gap-3 border border-primary/30 bg-background/90">
            <ManeuverBadge ManeuverIcon={ManeuverIcon} step={currentStep} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-extrabold text-foreground leading-none tabular-nums">
                {formatDistance(currentStep.distance)}
              </p>
              <p className="text-xs font-medium text-muted-foreground leading-tight line-clamp-2 mt-1">
                {currentStep.instruction}
              </p>
            </div>
            {dynamicETA?.distanceKm && (
              <div className="text-right shrink-0 border-l border-border/40 pl-2.5">
                <p className="text-sm font-bold text-primary leading-tight tabular-nums">
                  {dynamicETA.distanceKm} km
                </p>
                <p className="text-[9px] text-muted-foreground leading-tight">{dynamicETA.minutes} min restantes</p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Aviso unificado — maniobra + fase del viaje activo. Mismo criterio
          que el banner de arriba (distancia grande, icono grande con
          insignia de salida en rotondas) pero un punto más compacto para
          dejar sitio a la fase del viaje (recogida/bajada) y el ETA. */}
      {showActiveTrip && activeTripRole === "driver" && hasStartedDriving && currentStep && (
        <motion.div
          className="absolute top-16 left-4 right-4 pointer-events-none z-10"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="glass-strong rounded-xl px-2.5 py-2 flex items-center gap-2.5 border border-primary/20 bg-background/90">
            <ManeuverBadge ManeuverIcon={ManeuverIcon} step={currentStep} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <p className="text-lg font-extrabold text-foreground leading-none tabular-nums">
                  {formatDistance(currentStep.distance)}
                </p>
                {dynamicETA && (
                  <span className="text-[10px] text-primary font-semibold shrink-0">
                    · {dynamicETA.minutes} min{dynamicETA.distanceKm ? ` · ${dynamicETA.distanceKm} km` : ''}
                  </span>
                )}
              </div>
              <p className="text-[11px] font-medium text-foreground leading-tight line-clamp-1 mt-0.5">
                {currentStep.instruction}
              </p>
              <p className="text-[9px] text-muted-foreground leading-tight line-clamp-1">{LEG_LABELS[currentLeg]}</p>
            </div>
          </div>
        </motion.div>
      )}
    </>
  );
};

export default NavigationOverlays;
