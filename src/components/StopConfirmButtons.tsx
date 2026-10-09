import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, MapPin, X } from 'lucide-react';
import { OVERLAY_BOTTOM_PX, overlayBottom } from '@/lib/overlayLayout';

export interface PassengerStopPill {
  /** Id del pasajero — identifica la chapa de forma estable durante todo el
   *  viaje, aunque cambie de estado (esperando → a bordo → bajado). */
  key: string;
  passengerId: string;
  name: string;
  /** 'waiting_pickup' = todavía hay que recogerlo (chapa transparente).
   *  'in_car' = ya va a bordo (chapa verde). Al confirmar la bajada, la
   *  chapa desaparece de la lista y dejas ver la del siguiente pasajero. */
  status: 'waiting_pickup' | 'in_car';
  /** Minutos hasta recogerlo — solo se muestra mientras está esperando. */
  pickupEtaMin?: number;
  /** Minutos hasta dejarlo — se muestra siempre que se conozca. */
  dropoffEtaMin?: number;
  acceptsPets?: boolean;
  hasChildSeat?: boolean;
  /** Texto pequeño encima de la chapa (p. ej. el coche del conductor). */
  topLabel?: string;
}

function extrasText(stop: PassengerStopPill): string | null {
  const parts = [stop.acceptsPets && 'lleva mascota', stop.hasChildSeat && 'necesita silla para niños'].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

interface StopConfirmButtonsProps {
  /** Una chapa por pasajero a bordo o pendiente de recoger — la primera
   *  (la más próxima) va abajo del todo, las siguientes van subiendo. */
  stops: PassengerStopPill[];
  /** Ids de pasajero con una confirmación en curso (bajada esperando que el
   *  pasajero también la confirme). */
  pendingKeys: Set<string>;
  onConfirm: (stop: PassengerStopPill) => void;
  /** Botón adicional a la izquierda de la chapa más próxima (p. ej. cancelar
   *  el viaje del pasajero antes de subir) — con hueco real respecto a la
   *  chapa, no una posición fija aparte que pueda acabar pegada a ella. */
  leadingAction?: { onClick: () => void; label: string };
}

// Separación mínima pero segura: suficiente para no dar a dos chapas a la
// vez sin querer, sin desperdiciar el espacio del mapa como antes.
const BUTTON_SPACING_PX = 44;
/** Chapas apiladas como máximo: con más, la pila subiría hasta tapar la barra
 *  superior. Las que sobran se resumen en un contador. */
const MAX_VISIBLE_PILLS = 4;
// 130 dejaba la chapa (y su leyenda, 16px más abajo) pegada a la columna de
// zoom/centrar de BottomActionBar (bottom:20, ~104px de alto) — subida a
// 160 para que quede un hueco claro entre ambas.
const BASE_BOTTOM_PX = OVERLAY_BOTTOM_PX.stopPills;

/**
 * Una chapa por pasajero del viaje (no solo la "siguiente parada"), apiladas
 * en el lateral derecho del mapa — la de abajo del todo es la más próxima.
 * Cada una sirve para confirmar TANTO la subida como la bajada de ESE
 * pasajero: mientras espera a que lo recojan aparece transparente con
 * "X min · Nombre · Y min" (tiempo hasta recogerlo, tiempo hasta dejarlo);
 * en cuanto lo recoges se pone verde y opaca y solo enseña el tiempo hasta
 * dejarlo; al confirmar la bajada desaparece y dejas ver la chapa del
 * siguiente pasajero que ocupe ese hueco.
 */
const StopConfirmButtons = ({ stops, pendingKeys, onConfirm, leadingAction }: StopConfirmButtonsProps) => {
  if (stops.length === 0) return null;
  const visibleStops = stops.slice(0, MAX_VISIBLE_PILLS);
  const hiddenCount = stops.length - visibleStops.length;

  const pill = (stop: PassengerStopPill, index: number, stacked: boolean) => {
    const isPending = pendingKeys.has(stop.key);
    const waitingPickup = stop.status === 'waiting_pickup';
    return (
      <motion.button
        key={stop.key}
        initial={{ opacity: 0, scale: 0.7, y: stacked ? -index * BUTTON_SPACING_PX + 12 : 0 }}
        animate={{ opacity: waitingPickup ? 0.45 : 1, scale: 1, y: stacked ? -index * BUTTON_SPACING_PX : 0 }}
        exit={{ opacity: 0, scale: 0.6 }}
        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
        disabled={isPending}
        onClick={() => onConfirm(stop)}
        className={`${stacked ? 'absolute right-0 bottom-0' : 'relative'} pointer-events-auto flex items-center gap-1 max-w-[52vw] px-2.5 py-1.5 rounded-full backdrop-blur-md border shadow-lg text-white disabled:opacity-50 ${
          waitingPickup ? 'bg-foreground/30 border-foreground/30' : 'bg-success/70 border-success/60'
        }`}
      >
        {extrasText(stop) && (
          <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-0.5 text-[10px] text-white whitespace-nowrap pointer-events-none">
            {extrasText(stop)}
          </span>
        )}
        {stop.topLabel && (
          <span className="absolute right-0 bottom-full mb-0.5 text-[10px] text-white whitespace-nowrap pointer-events-none">
            {stop.topLabel}
          </span>
        )}
        {isPending ? (
          <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
        ) : waitingPickup ? (
          <MapPin className="w-3 h-3 shrink-0" />
        ) : (
          <Check className="w-3 h-3 shrink-0" />
        )}
        <span className="text-[11px] font-semibold truncate">
          {waitingPickup
            ? `${stop.pickupEtaMin ?? '–'} min · ${stop.name} · ${stop.dropoffEtaMin ?? '–'} min`
            : `${stop.name} · ${stop.dropoffEtaMin ?? '–'} min`}
        </span>
      </motion.button>
    );
  };

  return (
    <div className="fixed right-3 z-30 pointer-events-none" style={{ bottom: overlayBottom(BASE_BOTTOM_PX) }}>
      <AnimatePresence>
        {visibleStops.map((stop, index) =>
          index === 0 && leadingAction ? (
            // La chapa más próxima lleva al lado, con hueco de verdad (no una
            // posición fija aparte que pueda acabar pegada), un botón extra —
            // y a su IZQUIERDA, porque en un flex-row lo primero en el
            // markup queda a la izquierda del resto.
            <div key={stop.key} className="absolute right-0 bottom-0 flex items-center gap-3 pointer-events-auto">
              <button
                type="button"
                onClick={leadingAction.onClick}
                aria-label={leadingAction.label}
                className="w-7 h-7 rounded-full bg-destructive/80 backdrop-blur-md border border-destructive/60 shadow-lg text-white flex items-center justify-center shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              {pill(stop, index, false)}
            </div>
          ) : (
            pill(stop, index, true)
          ),
        )}
      </AnimatePresence>
      {/* Explicación corta, en una sola línea — la anterior tenía varias
         líneas y, al estar anclada por el borde inferior, crecía hacia
         arriba y acababa solapando la chapa de abajo. whitespace-nowrap
         evita que eso vuelva a pasar. */}
      {hiddenCount > 0 && (
        <span
          className="absolute right-0 text-[10px] text-white whitespace-nowrap pointer-events-none"
          style={{ bottom: BUTTON_SPACING_PX * visibleStops.length }}
        >
          +{hiddenCount} más
        </span>
      )}
      <p
        className="absolute right-0 text-[8px] text-white/60 whitespace-nowrap pointer-events-none"
        style={{ bottom: -16 }}
      >
        Toca para confirmar
      </p>
    </div>
  );
};

export default memo(StopConfirmButtons);
