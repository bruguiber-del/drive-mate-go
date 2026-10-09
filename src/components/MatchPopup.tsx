import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { OVERLAY_BOTTOM_PX, overlayBottom } from '@/lib/overlayLayout';

export interface MatchData {
  userName: string;
  detourMinutes: number;
  /** Lo que recibe el conductor por este pasajero. */
  compensation: number;
  acceptsPets?: boolean;
  hasChildSeat?: boolean;
}

interface MatchPopupProps {
  isOpen: boolean;
  onAccept: () => void;
  onReject: () => void;
  matchData?: MatchData;
}

const defaultData: MatchData = {
  userName: 'María G.',
  detourMinutes: 3,
  compensation: 4.50,
  acceptsPets: true,
  hasChildSeat: false,
};

/** Chapa de solicitud nueva — nombre, desvío y lo que recibes, con aceptar
 *  y rechazar, igual que las chapas de recogida/bajada. */
const MatchPopup = ({ isOpen, onAccept, onReject, matchData }: MatchPopupProps) => {
  const data = matchData || defaultData;
  const extrasText = [
    data.acceptsPets && 'lleva mascota',
    data.hasChildSeat && 'necesita silla para niños',
  ].filter(Boolean).join(' · ');

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.7, x: 20 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          className="fixed right-3 z-40 pointer-events-none"
          style={{ bottom: overlayBottom(OVERLAY_BOTTOM_PX.acceptPill) }}
        >
          <div className="pointer-events-auto flex items-center gap-1.5">
            <div className="flex flex-col items-center gap-0.5 min-w-0">
              {extrasText && (
                <span className="text-[10px] text-white whitespace-nowrap">{extrasText}</span>
              )}
              <button
                onClick={onAccept}
                className="flex items-center gap-1.5 pl-3 pr-3 py-2 rounded-full bg-success/80 backdrop-blur-md border border-success/60 shadow-lg text-white max-w-[52vw]"
              >
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] font-semibold truncate">
                  +{data.detourMinutes} min · {data.userName} · +{data.compensation.toFixed(2)}€
                </span>
              </button>
            </div>
            <button
              onClick={onReject}
              className="w-8 h-8 rounded-full bg-foreground/30 backdrop-blur-md border border-foreground/30 shadow-lg text-white flex items-center justify-center shrink-0"
              aria-label="Rechazar solicitud"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default memo(MatchPopup);
