import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Siren, AlertOctagon, TrafficCone, Construction, Car, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { ROAD_ALERT_KINDS, ROAD_ALERT_LABEL, type RoadAlertKind } from "@/lib/roadAlerts";

const KIND_ICON: Record<RoadAlertKind, typeof Camera> = {
  radar: Camera,
  policia: Siren,
  accidente: AlertOctagon,
  obstaculo: TrafficCone,
  obra: Construction,
  atasco: Car,
};

interface RoadAlertButtonProps {
  /** Dónde se marca el aviso — tu posición real ahora mismo. */
  location: [number, number] | null;
  onReport: (kind: RoadAlertKind, lat: number, lng: number) => Promise<{ ok: boolean; reason?: string }>;
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

  const handlePick = async (kind: RoadAlertKind) => {
    if (!location || sending) return;
    setSending(true);
    try {
      const { ok, reason } = await onReport(kind, location[0], location[1]);
      toast({
        title: ok ? `${ROAD_ALERT_LABEL[kind]} avisado` : "No se pudo avisar",
        description: ok ? "Gracias — se enseña a los demás en el mapa." : (reason ?? "Inténtalo de nuevo en un momento."),
        variant: ok ? undefined : "destructive",
        duration: 3000,
      });
      if (ok) setOpen(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button
        variant="glass"
        size="icon"
        className="w-8 h-8 rounded-full shadow-lg pointer-events-auto border border-warning/40"
        onClick={() => setOpen(true)}
        aria-label="Avisar de un radar, policía u otro problema en la carretera"
        disabled={!location}
      >
        <AlertTriangle className="w-4 h-4 text-warning" />
      </Button>

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
                <h3 className="text-lg font-bold text-foreground">¿Qué hay ahí?</h3>
                <button onClick={() => setOpen(false)} aria-label="Cerrar">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default RoadAlertButton;
