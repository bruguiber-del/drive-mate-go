import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';

export interface DropoffStop {
  /** Identifica la parada de forma estable aunque cambie de posición en la lista. */
  key: string;
  label: string;
  passengerIds: string[];
}

interface DropoffConfirmButtonsProps {
  /** Paradas de bajada pendientes, en el orden real de la ruta — la primera
   *  (la más próxima) va abajo del todo, las siguientes van subiendo. */
  stops: DropoffStop[];
  /** Claves de paradas ya pulsadas, esperando la confirmación del pasajero. */
  pendingKeys: Set<string>;
  onConfirm: (stop: DropoffStop) => void;
}

// Separación vertical entre botones — suficiente para no dar a dos a la vez
// por error, y por debajo de la tarjeta del viaje activo.
const BUTTON_SPACING_PX = 74;
const BASE_BOTTOM_PX = 200;

/**
 * Un botón por pasajero a bordo, apilados en el lateral derecho del mapa,
 * en el orden en que se les va a dejar — el de abajo es la próxima parada.
 * Al confirmar uno desaparece y los demás bajan un hueco, como un ascensor.
 * Semitransparentes a propósito para no tapar el mapa.
 */
const DropoffConfirmButtons = ({ stops, pendingKeys, onConfirm }: DropoffConfirmButtonsProps) => {
  if (stops.length === 0) return null;

  return (
    <div className="fixed right-3 z-30 pointer-events-none" style={{ bottom: BASE_BOTTOM_PX }}>
      <AnimatePresence>
        {stops.map((stop, index) => {
          const isPending = pendingKeys.has(stop.key);
          return (
            <motion.button
              key={stop.key}
              initial={{ opacity: 0, scale: 0.7, y: -index * BUTTON_SPACING_PX + 12 }}
              animate={{ opacity: 1, scale: 1, y: -index * BUTTON_SPACING_PX }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              disabled={isPending}
              onClick={() => onConfirm(stop)}
              className="absolute right-0 bottom-0 pointer-events-auto flex items-center gap-1.5 max-w-[42vw] px-3 py-2 rounded-full bg-success/55 backdrop-blur-md border border-success/50 shadow-lg text-white disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="text-xs font-semibold truncate">{stop.label}</span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default memo(DropoffConfirmButtons);
