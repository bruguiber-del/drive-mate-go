import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, User, ShieldCheck, Gift, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PassengerReceipt } from '@/hooks/usePassengerSimulation';

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
  /** Un ticket por pasajero (lo que pagó y por qué) — vacío cuando quien
   *  valora es un pasajero, o en un viaje sin desglose guardado. */
  receiptLines?: { id: string; name: string; receipt: PassengerReceipt }[];
  /** Valoración de la app en sí (no de las personas del viaje) — aparte del
   *  resto, se envía en el momento (no espera al botón "Enviar valoración"). */
  onSubmitAppRating?: (rating: number, review?: string) => void;
}

const MIN_REVIEW_LENGTH = 10;
const MAX_REVIEW_LENGTH = 140;

const RatingModal = ({
  isOpen,
  onClose,
  onSubmit,
  targets,
  tripInfo,
  totalSaved,
  receiptLines = [],
  onSubmitAppRating,
}: RatingModalProps) => {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [hovered, setHovered] = useState<Record<string, number>>({});
  const [reviews, setReviews] = useState<Record<string, string>>({});
  const [appRating, setAppRating] = useState(0);
  const [appHovered, setAppHovered] = useState(0);
  const [appReview, setAppReview] = useState('');
  const [appRatingSent, setAppRatingSent] = useState(false);

  const reset = () => {
    setRatings({});
    setHovered({});
    setReviews({});
    setAppRating(0);
    setAppHovered(0);
    setAppReview('');
    setAppRatingSent(false);
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

  // Totales del ticket — derivados de receiptLines, no se piden aparte.
  const totalPaidByPassengers = receiptLines.reduce((s, l) => s + l.receipt.passengerPrice, 0);
  const totalDriverCommission = receiptLines.reduce((s, l) => s + l.receipt.driverCommissionShare, 0);
  const totalPassengerCommission = receiptLines.reduce((s, l) => s + l.receipt.commissionAmount, 0);
  const totalCommission = totalDriverCommission + totalPassengerCommission;
  // totalSaved ya es lo que el conductor recibe de verdad (driverIncome ya
  // descuenta su propia mitad de la comisión dentro de calculatePrice) — no
  // se le resta totalDriverCommission otra vez, eso la descontaría dos veces.
  const driverNet = totalSaved ?? 0;

  const handleSubmitAppRating = () => {
    if (appRating === 0) return;
    onSubmitAppRating?.(appRating, appReview.trim() || undefined);
    setAppRatingSent(true);
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

            {/* Todo el contenido scrollea junto — con el ticket + valoraciones
                + valorar la app, el modal entero no cabe siempre en pantalla
                (antes solo scrolleaba la lista de valoraciones). */}
            <div className="flex-1 overflow-y-auto space-y-4 my-4 pr-1">
              {/* Ticket del viaje — lo que pagó cada pasajero y por qué,
                  resumido. Solo hay receiptLines en el lado conductor; si no
                  hay desglose guardado pero sí un total, se enseña el aviso
                  simple de siempre como respaldo. */}
              {receiptLines.length > 0 ? (
                <div className="glass rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Receipt className="w-4 h-4 text-success shrink-0" />
                    <p className="font-semibold text-foreground text-sm">Resumen del viaje</p>
                  </div>
                  <div className="space-y-2 font-mono text-[11px]">
                    {receiptLines.map((l) => {
                      const parts = [
                        `tu parte ${l.receipt.tripShare.toFixed(2)}€`,
                        l.receipt.detourCharge > 0 && `desvío ${l.receipt.detourCharge.toFixed(2)}€`,
                        l.receipt.extrasSurcharge > 0 && `extras ${l.receipt.extrasSurcharge.toFixed(2)}€`,
                        `comisión ${l.receipt.commissionAmount.toFixed(2)}€`,
                      ].filter(Boolean);
                      return (
                        <div key={l.id}>
                          <div className="flex justify-between gap-2 text-foreground">
                            <span className="truncate">{l.name}</span>
                            <span className="font-semibold shrink-0">{l.receipt.passengerPrice.toFixed(2)}€</span>
                          </div>
                          {/* "tu parte" es el coste real ÷ los que iban en
                              el coche EN ESE MOMENTO — no el total de
                              personas del viaje entero. Un pasajero que
                              coincidió con más gente se divide entre más
                              (y paga menos cada uno) que uno que fue solo
                              contigo, aunque sea el mismo viaje. */}
                          <p className="text-muted-foreground/70">
                            coste real del tramo {l.receipt.totalCost.toFixed(2)}€ · dividido entre {l.receipt.occupants}
                          </p>
                          <p className="text-muted-foreground truncate">{parts.join(' · ')}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-dashed border-border/60 mt-3 pt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Total pasajeros</span>
                      <span>{totalPaidByPassengers.toFixed(2)}€</span>
                    </div>
                    {/* Tu propia mitad de la comisión — no la paga nadie
                        visible, ya está descontada de "Recibes" más abajo.
                        Se enseña aparte para que "Comisión VIMATCH" cuadre a
                        simple vista con la suma de esta línea y la de cada
                        pasajero. */}
                    <div className="flex justify-between">
                      <span>Tu comisión</span>
                      <span>{totalDriverCommission.toFixed(2)}€</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Comisión VIMATCH</span>
                      <span>{totalCommission.toFixed(2)}€</span>
                    </div>
                    <div className="flex justify-between text-foreground font-sans font-bold text-sm">
                      <span>Recibes</span>
                      <span className="text-success">{driverNet.toFixed(2)}€</span>
                    </div>
                  </div>
                </div>
              ) : (
                totalSaved != null &&
                totalSaved > 0 && (
                  <div className="glass rounded-xl p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center shrink-0">
                      <Gift className="w-5 h-5 text-success" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Has ahorrado <span className="text-success font-bold">{totalSaved.toFixed(2)}€</span> compartiendo
                      gastos con tus pasajeros.
                    </p>
                  </div>
                )
              )}

              {/* Una fila por persona a valorar */}
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

              {/* Antes prometía un 10% de descuento por valorar — no hay
                  ningún sistema de descuentos detrás, así que era una
                  promesa falsa. Lo que de verdad ocurre al valorar: ayuda a
                  mantener la confianza de la comunidad. */}
              {targets.length > 0 && (
                <div className="glass rounded-xl p-3 flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      allRated ? 'bg-success/20' : 'bg-muted'
                    }`}
                  >
                    <ShieldCheck className={`w-5 h-5 ${allRated ? 'text-success' : 'text-muted-foreground'}`} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Valora a las {targets.length} personas de este viaje: ayuda a que el resto sepa con quién va a
                    compartir trayecto.
                  </p>
                </div>
              )}

              {/* Apartado final — valorar la app en sí, aparte de a las
                  personas del viaje. Se envía con su propio botón, sin
                  esperar a "Enviar valoración" de abajo. */}
              <div className="rounded-xl border border-border/50 p-3">
                <p className="font-semibold text-foreground text-sm text-center mb-2">
                  ¿Qué tal tu experiencia con VIMATCH?
                </p>
                <div className="flex justify-center gap-1.5 mb-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onMouseEnter={() => setAppHovered(star)}
                      onMouseLeave={() => setAppHovered(0)}
                      onClick={() => {
                        setAppRating(star);
                        setAppRatingSent(false);
                      }}
                      className="transition-transform hover:scale-110"
                      aria-label={`${star} estrellas para VIMATCH`}
                    >
                      <Star
                        className={`w-7 h-7 transition-colors ${
                          star <= (appHovered || appRating)
                            ? 'text-warning fill-warning'
                            : 'text-muted stroke-muted-foreground'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={appReview}
                  onChange={(e) => {
                    setAppReview(e.target.value.slice(0, MAX_REVIEW_LENGTH));
                    setAppRatingSent(false);
                  }}
                  placeholder="Qué podríamos mejorar (opcional)"
                  className="w-full text-xs px-3 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  disabled={appRating === 0 || appRatingSent}
                  onClick={handleSubmitAppRating}
                >
                  {appRatingSent ? '¡Gracias por tu opinión!' : 'Enviar valoración de la app'}
                </Button>
              </div>
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
