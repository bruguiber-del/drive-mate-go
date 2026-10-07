import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, User, ShieldCheck, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface RatingTarget {
  id: string;
  name: string;
}

export interface PassengerRatingResult {
  id: string;
  rating: number;
  review?: string;
}

interface RatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (ratings: PassengerRatingResult[]) => void;
  /** Uno por pasajero del viaje (o el conductor, si lo valora un pasajero) —
   *  antes solo se podía valorar a una persona aunque el viaje llevara a
   *  varias a la vez. */
  targets: RatingTarget[];
  tripInfo: string;
  /** Total ahorrado por el conductor este viaje gracias a compartir gastos
   *  con sus pasajeros — no aplica cuando quien valora es un pasajero. */
  totalSaved?: number;
}

const MIN_REVIEW_LENGTH = 10;
const MAX_REVIEW_LENGTH = 140;

const RatingModal = ({ isOpen, onClose, onSubmit, targets, tripInfo, totalSaved }: RatingModalProps) => {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [hovered, setHovered] = useState<Record<string, number>>({});
  const [reviews, setReviews] = useState<Record<string, string>>({});

  const reset = () => {
    setRatings({});
    setHovered({});
    setReviews({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Una reseña es opcional, pero si se escribe algo tiene que tener
  // contenido de verdad — nada de "bien" o una letra suelta.
  const reviewErrors = targets.reduce<Record<string, boolean>>((acc, t) => {
    const text = (reviews[t.id] ?? '').trim();
    acc[t.id] = text.length > 0 && text.length < MIN_REVIEW_LENGTH;
    return acc;
  }, {});
  const hasReviewErrors = Object.values(reviewErrors).some(Boolean);
  const someoneRated = targets.some((t) => (ratings[t.id] ?? 0) > 0);
  const allRated = targets.length > 0 && targets.every((t) => (ratings[t.id] ?? 0) > 0);

  const handleSubmit = () => {
    if (!someoneRated || hasReviewErrors) return;
    const results: PassengerRatingResult[] = targets
      .filter((t) => (ratings[t.id] ?? 0) > 0)
      .map((t) => ({
        id: t.id,
        rating: ratings[t.id],
        review: (reviews[t.id] ?? '').trim() || undefined,
      }));
    onSubmit(results);
    reset();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-background/90 backdrop-blur-md" onClick={handleClose} />

          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="relative glass-strong rounded-3xl p-6 w-full max-w-sm max-h-[85vh] flex flex-col"
          >
            <div className="text-center shrink-0">
              <h3 className="text-xl font-bold text-foreground">¡Viaje completado!</h3>
              <p className="text-muted-foreground mt-1">{tripInfo}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {targets.length} {targets.length === 1 ? "persona" : "personas"} en este viaje
              </p>
            </div>

            {/* Total ahorrado — solo tiene sentido para el conductor */}
            {totalSaved != null && totalSaved > 0 && (
              <div className="glass rounded-xl p-3 flex items-center gap-3 my-4 shrink-0">
                <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center shrink-0">
                  <Gift className="w-5 h-5 text-success" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Has ahorrado <span className="text-success font-bold">{totalSaved.toFixed(2)}€</span> compartiendo
                  gastos con tus pasajeros.
                </p>
              </div>
            )}

            {/* Una fila por persona a valorar */}
            <div className="flex-1 overflow-y-auto space-y-4 my-2 pr-1">
              {targets.map((t) => (
                <div key={t.id} className="rounded-xl border border-border/50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-primary-foreground" />
                    </div>
                    <p className="font-semibold text-foreground text-sm truncate">{t.name}</p>
                  </div>
                  <div className="flex justify-center gap-1.5 mb-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onMouseEnter={() => setHovered((p) => ({ ...p, [t.id]: star }))}
                        onMouseLeave={() => setHovered((p) => ({ ...p, [t.id]: 0 }))}
                        onClick={() => setRatings((p) => ({ ...p, [t.id]: star }))}
                        className="transition-transform hover:scale-110"
                        aria-label={`${star} estrellas para ${t.name}`}
                      >
                        <Star
                          className={`w-7 h-7 transition-colors ${
                            star <= (hovered[t.id] || ratings[t.id] || 0)
                              ? 'text-warning fill-warning'
                              : 'text-muted stroke-muted-foreground'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={reviews[t.id] ?? ''}
                    onChange={(e) => setReviews((p) => ({ ...p, [t.id]: e.target.value.slice(0, MAX_REVIEW_LENGTH) }))}
                    placeholder="Reseña opcional (mín. 10 letras)"
                    className="w-full text-xs px-3 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {reviewErrors[t.id] && (
                    <p className="text-[10px] text-destructive mt-1">Escribe al menos 10 letras, o déjala vacía.</p>
                  )}
                </div>
              ))}
            </div>

            {/* Antes prometía un 10% de descuento por valorar — no hay ningún
                sistema de descuentos detrás, así que era una promesa falsa.
                Lo que de verdad ocurre al valorar: ayuda a mantener la
                confianza de la comunidad. */}
            <div className="glass rounded-xl p-3 flex items-center gap-3 mb-4 mt-2 shrink-0">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  allRated ? 'bg-success/20' : 'bg-muted'
                }`}
              >
                <ShieldCheck className={`w-5 h-5 ${allRated ? 'text-success' : 'text-muted-foreground'}`} />
              </div>
              <p className="text-sm text-muted-foreground">
                Valora a las {targets.length} personas de este viaje: ayuda a que el resto sepa con quién va a compartir
                trayecto.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 shrink-0">
              <Button variant="ghost" className="flex-1" onClick={handleClose}>
                Omitir
              </Button>
              <Button
                variant="driver"
                className="flex-1"
                onClick={handleSubmit}
                disabled={!someoneRated || hasReviewErrors}
              >
                Enviar valoración
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RatingModal;
