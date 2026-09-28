import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, MapPin } from 'lucide-react';

export interface StopButton {
  /** Identifica la parada de forma estable aunque cambie de posición en la lista. */
  key: string;
  label: string;
  passengerIds: string[];
  /** 'pickup' = todavía hay que recoger a este pasajero (como mucho una a
   *  la vez: la siguiente parada física de la ruta). 'dropoff' = ya va a
   *  bordo y hay que confirmar que se baja — puede haber varias a la vez,
   *  en cualquier orden. */
  kind: 'pickup' | 'dropoff';
}

interface StopConfirmButtonsProps {
  /** Paradas pendientes (recogida + bajada), en el orden real de la ruta —
   *  la primera (la más próxima) va abajo del todo, las siguientes van
   *  subiendo. */
  stops: StopButton[];
  /** Claves de paradas ya pulsadas, esperando la confirmación del pasajero. */
  pendingKeys: Set<string>;
  onConfirm: (stop: StopButton) => void;
}

// Separación vertical entre botones — suficiente para no dar a dos a la vez
// por error, y por debajo de la tarjeta del viaje activo.
const BUTTON_SPACING_PX = 74;
const BASE_BOTTOM_PX = 200;

/**
 * Un botón por parada pendiente (recogida o bajada) apilado en el lateral
 * derecho del mapa, en el orden en que van a ocurrir de verdad — el de
 * abajo es la próxima. Antes recogida y bajada vivían en sitios separados
 * (recogida en la tarjeta grande de abajo, bajada aquí) y un pasajero
 * todavía sin recoger podía aparecer también en la lista de bajada; ahora
 * es una sola lista, distinguida por icono/color (pin de recogida vs.
 * check verde de bajada), y solo incluye pasajeros de verdad a bordo para
 * la bajada. Al confirmar uno desaparece y los demás bajan un hueco, como
 * un ascensor. Semitransparentes a propósito para no tapar el mapa.
 */
const StopConfirmButtons = ({ stops, pendingKeys, onConfirm }: StopConfirmButtonsProps) => {
  if (stops.length === 0) return null;

  return (
    <div className="fixed right-3 z-30 pointer-events-none" style={{ bottom: BASE_BOTTOM_PX }}>
      <AnimatePresence>
        {stops.map((stop, index) => {
          const isPending = pendingKeys.has(stop.key);
          const isPickup = stop.kind === 'pickup';
          return (
            <motion.button
              key={stop.key}
              initial={{ opacity: 0, scale: 0.7, y: -index * BUTTON_SPACING_PX + 12 }}
              animate={{ opacity: 1, scale: 1, y: -index * BUTTON_SPACING_PX }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              disabled={isPending}
              onClick={() => onConfirm(stop)}
              className={`absolute right-0 bottom-0 pointer-events-auto flex items-center gap-1.5 max-w-[42vw] px-3 py-2 rounded-full backdrop-blur-md border shadow-lg text-white disabled:opacity-50 ${
                isPickup ? 'bg-warning/55 border-warning/50' : 'bg-success/55 border-success/50'
              }`}
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
              ) : isPickup ? (
                <MapPin className="w-3.5 h-3.5 shrink-0" />
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

export default memo(StopConfirmButtons);
