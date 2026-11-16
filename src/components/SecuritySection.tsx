import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, AlertTriangle, Phone, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

type ReportKind = 'accidente' | 'conductor' | 'pasajero' | 'otro';

const KIND_OPTIONS: { value: ReportKind; label: string }[] = [
  { value: 'accidente', label: 'Accidente' },
  { value: 'conductor', label: 'Mal comportamiento del conductor' },
  { value: 'pasajero', label: 'Mal comportamiento de un pasajero' },
  { value: 'otro', label: 'Otra cosa' },
];

const MIN_LENGTH = 10;

interface SecuritySectionProps {
  isOpen: boolean;
  onClose: () => void;
  /** Viaje activo ahora mismo, si lo hay — se adjunta a la denuncia. */
  tripId?: string | null;
  /** A quién podría estar señalando la denuncia (el conductor, si eres
   *  pasajero; o los pasajeros a bordo, si eres conductor) — opcional,
   *  "accidente" u "otro" no tienen por qué apuntar a nadie en concreto. */
  otherParty?: { id: string; name: string }[];
}

/**
 * Apartado de seguridad, fuera del mapa — antes el botón de denuncia vivía
 * flotando sobre el mapa (ver el antiguo SosButton), mezclado con el resto
 * de controles de navegación; ahora tiene su propio sitio en el menú, con
 * la llamada de emergencia real (112) por delante de la denuncia.
 */
const SecuritySection = ({ isOpen, onClose, tripId = null, otherParty = [] }: SecuritySectionProps) => {
  const { toast } = useToast();
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [reportedUserId, setReportedUserId] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);

  const resetForm = () => {
    setKind(null);
    setReportedUserId('');
    setDescription('');
  };

  const handleSubmit = async () => {
    if (!kind || description.trim().length < MIN_LENGTH) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('submit-report', {
        body: {
          kind,
          description: description.trim(),
          tripId: tripId ?? undefined,
          reportedUserId: reportedUserId || undefined,
        },
      });
      if (error || !data?.ok) {
        toast({
          title: 'No se pudo enviar la denuncia',
          description: (data as { error?: string } | null)?.error ?? error?.message ?? 'Inténtalo de nuevo en un momento.',
          variant: 'destructive',
          duration: 3500,
        });
        return;
      }
      toast({
        title: 'Denuncia enviada',
        description: 'Un admin la revisará lo antes posible.',
        duration: 3000,
      });
      resetForm();
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50"
    >
      <div className="absolute inset-0 bg-background/95 backdrop-blur-md" onClick={onClose} />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25 }}
        className="absolute inset-x-0 bottom-0 top-12 bg-card rounded-t-3xl overflow-hidden"
      >
        <div className="h-full overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-card/95 backdrop-blur-sm p-4 flex items-center justify-between border-b border-border">
            <h2 className="text-xl font-bold text-foreground">Seguridad</h2>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="p-6 space-y-6">
            {/* SOS real — llamada directa a emergencias, igual que el de
                Ayuda, pero aquí es el primero que se ve. */}
            <div className="glass rounded-xl p-4 flex items-center gap-3 border border-destructive/30">
              <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
                <Phone className="w-5 h-5 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">¿Emergencia ahora mismo?</p>
                <p className="text-sm text-muted-foreground">Llama directamente a servicios de emergencia</p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  window.location.href = 'tel:112';
                }}
              >
                SOS · 112
              </Button>
            </div>

            {/* Denuncia — antes era un botón flotando sobre el mapa; ahora
                vive aquí, en seguridad, fuera de los controles de
                navegación. */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <h3 className="font-semibold text-foreground">Denunciar</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Esto avisa directamente a un admin, no es un mensaje al conductor/pasajero.
              </p>

              <div className="grid grid-cols-1 gap-2">
                {KIND_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setKind(opt.value)}
                    className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                      kind === opt.value
                        ? 'border-destructive bg-destructive/10 text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {kind && (kind === 'conductor' || kind === 'pasajero') && otherParty.length > 0 && (
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
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar denuncia'}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default SecuritySection;
