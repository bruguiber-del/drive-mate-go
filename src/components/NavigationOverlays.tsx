import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Navigation } from "lucide-react";
import { formatDistance, formatDuration, formatArrivalTime } from "@/lib/format";
import { overlayTop } from "@/lib/overlayLayout";
import LaneGuidance from "@/components/LaneGuidance";
import type { RouteStep } from "@/hooks/useRouting";
import type { TripLeg } from "@/hooks/useWaypoints";
import type { TripStatus } from "@/hooks/useTripLifecycle";

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
  // El número de salida es la parte que de verdad hay que leer de un
  // vistazo en una rotonda — antes salía como una insignia pequeña (18px,
  // texto de 10px) fácil de no ver conduciendo. Mucho más grande que el
  // resto de insignias de la app a propósito.
  const exitBadge = size === "lg" ? "min-w-[28px] h-[28px] text-base -top-2 -right-2" : "min-w-[22px] h-[22px] text-sm -top-1.5 -right-1.5";
  return (
    <div className={`relative ${box} bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/30`}>
      <ManeuverIcon className={`${icon} text-primary-foreground`} strokeWidth={2.5} />
      {exit != null && (
        <span className={`absolute ${exitBadge} px-1.5 rounded-full bg-warning text-warning-foreground font-extrabold flex items-center justify-center border-2 border-background shadow-md`}>
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
  /** Solo hace falta para saber si un pasajero ya ha sido recogido — antes
   *  de eso, él también tiene su propio aviso giro a giro (andando hacia
   *  el punto de encuentro), no solo el conductor. */
  tripStatus?: TripStatus;
  hasPassenger: boolean;
  hasStartedDriving: boolean;
  currentStep: RouteStep | null;
  /** Distancia en vivo desde la posición actual hasta la maniobra — baja
   *  de verdad según te acercas, no la longitud fija del tramo. */
  distanceToManeuver: number | null;
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
  tripStatus,
  hasPassenger,
  hasStartedDriving,
  currentStep,
  distanceToManeuver,
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
            className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
            // "top-24" era un valor fijo que no contaba con la barra superior
            // creciendo por la zona segura del notch/isla dinámica — en esos
            // móviles la barra ya no cabía antes del logo y se solapaban.
            // Mismo margen de siempre, mas lo que ocupe la zona segura. Subido
            // de 96 a 136 porque la fila de Casa/Trabajo/sitios guardados bajo
            // el buscador se añadió después y quedaba pegada al logo.
            style={{ top: overlayTop(136) }}
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
          className="absolute right-4 pointer-events-none z-10"
          style={{ top: overlayTop(64) }}
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
          className="absolute left-4 right-4 pointer-events-none z-10"
          style={{ top: overlayTop(64) }}
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
              {dynamicETA && <span className="text-xs font-bold text-primary">{formatDuration(dynamicETA.minutes)}</span>}
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
          className="absolute left-4 right-4 pointer-events-none z-10"
          style={{ top: overlayTop(64) }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="glass-strong rounded-xl px-3 py-2.5 flex items-center gap-3 border border-primary/30 bg-background/90">
            <ManeuverBadge ManeuverIcon={ManeuverIcon} step={currentStep} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-extrabold text-foreground leading-none tabular-nums">
                {formatDistance(distanceToManeuver ?? currentStep.distance)}
              </p>
              {/* En una rotonda, qué salida tomar es la parte crítica de la
                  frase — antes salía igual de pequeña y apagada que el
                  resto de instrucciones, costaba leerla de reojo
                  conduciendo. Aquí se destaca más grande y en negrita. */}
              <p
                className={
                  ROUNDABOUT_TYPES.has(currentStep.maneuver.type.toLowerCase())
                    ? "text-lg font-bold text-foreground leading-snug line-clamp-2 mt-1"
                    : "text-base font-medium text-muted-foreground leading-tight line-clamp-2 mt-1"
                }
              >
                {currentStep.instruction}
              </p>
              {currentStep.lanes && <LaneGuidance lanes={currentStep.lanes} />}
            </div>
            {dynamicETA?.distanceKm && (
              <div className="text-right shrink-0 border-l border-border/40 pl-2.5">
                <p className="text-sm font-bold text-primary leading-tight tabular-nums">
                  {formatDuration(dynamicETA.minutes)}
                </p>
                <p className="text-[9px] text-muted-foreground leading-tight">
                  {formatArrivalTime(dynamicETA.minutes)} · {dynamicETA.distanceKm} km
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Aviso unificado — maniobra + fase del viaje activo. Mismo criterio
          que el banner de arriba (distancia grande, icono grande con
          insignia de salida en rotondas) pero un punto más compacto para
          dejar sitio a la fase del viaje (recogida/bajada) y el ETA.
          También para el PASAJERO mientras anda hacia el punto de
          encuentro (antes de que lo recojan) — antes solo existía para el
          conductor, así que el pasajero se quedaba sin ningún giro a giro
          propio aunque su navegación ya estuviera redirigida allí. */}
      {showActiveTrip &&
        (activeTripRole === "driver" || (activeTripRole === "passenger" && tripStatus === "waiting")) &&
        hasStartedDriving && currentStep && (
        <motion.div
          className="absolute left-4 right-4 pointer-events-none z-10"
          style={{ top: overlayTop(64) }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="glass-strong rounded-xl px-2.5 py-2 flex items-center gap-2.5 border border-primary/20 bg-background/90">
            <ManeuverBadge ManeuverIcon={ManeuverIcon} step={currentStep} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <p className="text-lg font-extrabold text-foreground leading-none tabular-nums">
                  {formatDistance(distanceToManeuver ?? currentStep.distance)}
                </p>
                {dynamicETA && (
                  <span className="text-[10px] text-primary font-semibold shrink-0">
                    · {formatDuration(dynamicETA.minutes)}{dynamicETA.distanceKm ? ` · ${dynamicETA.distanceKm} km` : ''}
                  </span>
                )}
              </div>
              <p className="text-[11px] font-medium text-foreground leading-tight line-clamp-1 mt-0.5">
                {currentStep.instruction}
              </p>
              <p className="text-[9px] text-muted-foreground leading-tight line-clamp-1">
                {activeTripRole === "passenger" ? "Ve al punto de encuentro" : LEG_LABELS[currentLeg]}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </>
  );
};

export default NavigationOverlays;
