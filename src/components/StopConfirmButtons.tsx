import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, MapPin } from 'lucide-react';

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
}

interface StopConfirmButtonsProps {
  /** Una chapa por pasajero a bordo o pendiente de recoger — la primera
   *  (la más próxima) va abajo del todo, las siguientes van subiendo. */
  stops: PassengerStopPill[];
  /** Ids de pasajero con una confirmación en curso (bajada esperando que el
   *  pasajero también la confirme). */
  pendingKeys: Set<string>;
  onConfirm: (stop: PassengerStopPill) => void;
}

// Separación mínima pero segura: suficiente para no dar a dos chapas a la
// vez sin querer, sin desperdiciar el espacio del mapa como antes.
const BUTTON_SPACING_PX = 44;
// 130 dejaba la chapa (y su leyenda, 16px más abajo) pegada a la columna de
// zoom/centrar de BottomActionBar (bottom:20, ~104px de alto) — subida a
// 160 para que quede un hueco claro entre ambas.
const BASE_BOTTOM_PX = 160;

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
const StopConfirmButtons = ({ stops, pendingKeys, onConfirm }: StopConfirmButtonsProps) => {
  if (stops.length === 0) return null;

  return (
    <div className="fixed right-3 z-30 pointer-events-none" style={{ bottom: BASE_BOTTOM_PX }}>
      <AnimatePresence>
        {stops.map((stop, index) => {
          const isPending = pendingKeys.has(stop.key);
          const waitingPickup = stop.status === 'waiting_pickup';
          return (
            <motion.button
              key={stop.key}
              initial={{ opacity: 0, scale: 0.7, y: -index * BUTTON_SPACING_PX + 12 }}
              animate={{ opacity: waitingPickup ? 0.45 : 1, scale: 1, y: -index * BUTTON_SPACING_PX }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              disabled={isPending}
              onClick={() => onConfirm(stop)}
              className={`absolute right-0 bottom-0 pointer-events-auto flex items-center gap-1 max-w-[52vw] px-2.5 py-1.5 rounded-full backdrop-blur-md border shadow-lg text-white disabled:opacity-50 ${
                waitingPickup ? 'bg-foreground/30 border-foreground/30' : 'bg-success/70 border-success/60'
              }`}
            >
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
        })}
      </AnimatePresence>
      {/* Explicación corta, en una sola línea — la anterior tenía varias
         líneas y, al estar anclada por el borde inferior, crecía hacia
         arriba y acababa solapando la chapa de abajo. whitespace-nowrap
         evita que eso vuelva a pasar. */}
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
