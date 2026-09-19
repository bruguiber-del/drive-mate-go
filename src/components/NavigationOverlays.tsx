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
  dynamicETA: { minutes: number } | null;
  detourMinutes: number | null;
  driverSeats: number;
  driverMaxDetour: number;
  activeVehiclePlate?: string;
  isDoorToDoor: boolean;
  hasMeetingPoint: boolean;
  walkingRouteData: { duration: number; distance: number } | null;
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
  isDoorToDoor,
  hasMeetingPoint,
  walkingRouteData,
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

      {/* Turn-by-turn banner — SOLO cuando navegando SIN viaje activo */}
      {isNavigating && hasStartedDriving && !showActiveTrip && currentStep && (
        <motion.div
          className="absolute top-16 left-4 right-4 pointer-events-none z-10"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="glass-strong rounded-lg px-2.5 py-2 flex items-center gap-2 border border-primary/30 bg-background/90">
            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <ManeuverIcon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground leading-tight line-clamp-2">{currentStep.instruction}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">En {formatDistance(currentStep.distance)}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Aviso unificado — maniobra + fase del viaje activo */}
      {showActiveTrip && activeTripRole === "driver" && hasStartedDriving && currentStep && (
        <motion.div
          className="absolute top-16 left-4 right-4 pointer-events-none z-10"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="glass-strong rounded-lg px-2 py-1 flex items-center gap-1.5 border border-primary/20 bg-background/90">
            <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center shrink-0">
              <ManeuverIcon className="w-3 h-3 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-foreground leading-tight line-clamp-2">{currentStep.instruction}</p>
              <p className="text-[9px] text-muted-foreground leading-tight line-clamp-1">
                En {formatDistance(currentStep.distance)}
                <span className="mx-1">·</span>
                {LEG_LABELS[currentLeg]}
                {dynamicETA && <span className="text-primary font-semibold"> · {dynamicETA.minutes} min</span>}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Passenger walking chip — SOLO pasajero */}
      {showActiveTrip && activeTripRole === "passenger" && hasMeetingPoint && !isDoorToDoor && walkingRouteData && (
        <motion.div
          className="absolute top-16 left-4 right-4 pointer-events-none z-10"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="glass-strong rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 border border-[hsl(280,70%,55%)]/30">
            <span className="text-sm">🚶</span>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-medium text-foreground">Camina al punto de encuentro</span>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xs font-bold" style={{ color: "hsl(280,70%,55%)" }}>
                {Math.ceil(walkingRouteData.duration / 60)} min
              </span>
              <span className="text-[9px] text-muted-foreground ml-1">
                {(walkingRouteData.distance / 1000).toFixed(1)} km
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </>
  );
};

export default NavigationOverlays;
