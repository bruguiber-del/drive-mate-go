import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Siren, AlertOctagon, TrafficCone, Construction, Car, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { ROAD_ALERT_KINDS, ROAD_ALERT_LABEL, RADAR_TRAMO_KM_RANGE, type RoadAlertKind } from "@/lib/roadAlerts";

const KIND_ICON: Record<RoadAlertKind, typeof Camera> = {
  radar: Camera,
  radar_tramo: Camera,
  policia: Siren,
  accidente: AlertOctagon,
  obstaculo: TrafficCone,
  obra: Construction,
  atasco: Car,
};

interface RoadAlertButtonProps {
  /** Dónde se marca el aviso — tu posición real ahora mismo. */
  location: [number, number] | null;
  onReport: (kind: RoadAlertKind, lat: number, lng: number, lengthKm?: number) => Promise<{ ok: boolean; reason?: string }>;
}

/**
 * Botón redondo para avisar de un radar, policía, accidente u otro
 * problema en la carretera — pensado para usarse en un toque y medio,
 * conduciendo, sin tener que escribir nada (a diferencia del SOS, que sí
 * necesita una descripción porque va a admins).
 */
const RoadAlertButton = ({ location, onReport }: RoadAlertButtonProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  // El radar de tramo necesita un dato más (cuántos km dura) antes de
  // enviarse — el resto de tipos se mandan directamente al tocarlos.
  const [pendingTramoKm, setPendingTramoKm] = useState<number | null>(null);

  const submit = async (kind: RoadAlertKind, lengthKm?: number) => {
    if (!location || sending) return;
    setSending(true);
    try {
      const { ok, reason } = await onReport(kind, location[0], location[1], lengthKm);
      toast({
        title: ok ? `${ROAD_ALERT_LABEL[kind]} avisado` : "No se pudo avisar",
        description: ok ? "Gracias — se enseña a los demás en el mapa." : (reason ?? "Inténtalo de nuevo en un momento."),
        variant: ok ? undefined : "destructive",
        duration: 3000,
      });
      if (ok) {
        setOpen(false);
        setPendingTramoKm(null);
      }
    } finally {
      setSending(false);
    }
  };

  const handlePick = (kind: RoadAlertKind) => {
    if (kind === "radar_tramo") {
      setPendingTramoKm(RADAR_TRAMO_KM_RANGE.default);
      return;
    }
    submit(kind);
  };

  return (
    <>
      {/* Mismo tamaño y lenguaje visual que el velocímetro (círculo grande,
          borde grueso, sombra) en vez del icono pequeño de antes — a
          petición del usuario, que no le convencía el diseño anterior. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Avisar de un radar, policía u otro problema en la carretera"
        disabled={!location}
        className="relative w-16 h-16 rounded-full flex flex-col items-center justify-center shrink-0 border-4 border-warning bg-card shadow-lg pointer-events-auto transition-colors disabled:opacity-40"
      >
        <AlertTriangle className="w-6 h-6 text-warning" />
        <span className="text-[9px] font-bold leading-none mt-1 text-warning">Avisar</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center"
          >
            <div className="absolute inset-0 bg-background/90 backdrop-blur-md" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="relative w-full max-w-sm glass-strong rounded-t-3xl p-6 pb-8"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-foreground">
                  {pendingTramoKm != null ? "¿Cuántos km dura el control?" : "¿Qué hay ahí?"}
                </h3>
                <button
                  onClick={() => (pendingTramoKm != null ? setPendingTramoKm(null) : setOpen(false))}
                  aria-label="Cerrar"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              {pendingTramoKm != null ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-3">
                    <Camera className="w-7 h-7 text-warning shrink-0" />
                    <span className="text-3xl font-extrabold text-foreground tabular-nums">{pendingTramoKm} km</span>
                  </div>
                  <input
                    type="range"
                    min={RADAR_TRAMO_KM_RANGE.min}
                    max={RADAR_TRAMO_KM_RANGE.max}
                    value={pendingTramoKm}
                    onChange={(e) => setPendingTramoKm(Number(e.target.value))}
                    className="w-full accent-warning"
                  />
                  <Button
                    className="w-full"
                    disabled={sending}
                    onClick={() => submit("radar_tramo", pendingTramoKm)}
                  >
                    Avisar
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {ROAD_ALERT_KINDS.map((kind) => {
                    const Icon = KIND_ICON[kind];
                    return (
                      <button
                        key={kind}
                        type="button"
                        disabled={sending}
                        onClick={() => handlePick(kind)}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors disabled:opacity-50"
                      >
                        <Icon className="w-7 h-7 text-warning" />
                        <span className="text-xs text-foreground">{ROAD_ALERT_LABEL[kind]}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default RoadAlertButton;
