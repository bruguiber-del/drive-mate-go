import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

type ReportKind = "accidente" | "conductor" | "pasajero" | "otro";

const KIND_OPTIONS: { value: ReportKind; label: string }[] = [
  { value: "accidente", label: "Accidente" },
  { value: "conductor", label: "Mal comportamiento del conductor" },
  { value: "pasajero", label: "Mal comportamiento de un pasajero" },
  { value: "otro", label: "Otra cosa" },
];

const MIN_LENGTH = 10;

interface SosButtonProps {
  /** Viaje activo ahora mismo, si lo hay — se adjunta a la denuncia. */
  tripId?: string | null;
  /** A quién podría estar señalando la denuncia (el conductor, si eres
   *  pasajero; o los pasajeros a bordo, si eres conductor) — opcional,
   *  "accidente" u "otro" no tienen por qué apuntar a nadie en concreto. */
  otherParty?: { id: string; name: string }[];
}

/**
 * Botón SOS — siempre visible en el mapa, para denunciar un accidente o el
 * mal comportamiento de alguien del viaje. Antes no había ninguna forma de
 * avisar de esto desde la propia app; se manda a los admins en cuanto se
 * envía (ver submit-report), no espera a que alguien entre a revisar.
 */
const SosButton = ({ tripId = null, otherParty = [] }: SosButtonProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [reportedUserId, setReportedUserId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);

  const reset = () => {
    setKind(null);
    setReportedUserId("");
    setDescription("");
  };

  const handleClose = () => {
    if (sending) return;
    setOpen(false);
    reset();
  };

  const handleSubmit = async () => {
    if (!kind || description.trim().length < MIN_LENGTH) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-report", {
        body: {
          kind,
          description: description.trim(),
          tripId: tripId ?? undefined,
          reportedUserId: reportedUserId || undefined,
        },
      });
      if (error || !data?.ok) {
        toast({
          title: "No se pudo enviar la denuncia",
          description: (data as { error?: string } | null)?.error ?? error?.message ?? "Inténtalo de nuevo en un momento.",
          variant: "destructive",
          duration: 3500,
        });
        return;
      }
      toast({
        title: "Denuncia enviada",
        description: "Un admin la revisará lo antes posible.",
        duration: 3000,
      });
      setOpen(false);
      reset();
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button
        variant="destructive"
        size="icon"
        className="w-11 h-11 rounded-full shadow-lg pointer-events-auto"
        onClick={() => setOpen(true)}
        aria-label="SOS — denunciar accidente o mal comportamiento"
      >
        <span className="text-[10px] font-extrabold leading-none">SOS</span>
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center"
          >
            <div className="absolute inset-0 bg-background/90 backdrop-blur-md" onClick={handleClose} />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="relative w-full max-w-sm glass-strong rounded-t-3xl p-6 pb-8"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  <h3 className="text-lg font-bold text-foreground">Denunciar</h3>
                </div>
                <button onClick={handleClose} aria-label="Cerrar">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Esto avisa directamente a un admin, no es un mensaje al conductor/pasajero.
              </p>

              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2">
                  {KIND_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setKind(opt.value)}
                      className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                        kind === opt.value
                          ? "border-destructive bg-destructive/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {kind && (kind === "conductor" || kind === "pasajero") && otherParty.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">¿Sobre quién? (opcional)</label>
                    <select
                      value={reportedUserId}
                      onChange={(e) => setReportedUserId(e.target.value)}
                      className="w-full text-sm px-3 py-2 rounded-lg bg-muted text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">Sin especificar</option>
                      {otherParty.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Qué ha pasado (mín. 10 letras)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Describe lo ocurrido..."
                    className="w-full text-sm px-3 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>

                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={!kind || description.trim().length < MIN_LENGTH || sending}
                  onClick={handleSubmit}
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar denuncia"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SosButton;
