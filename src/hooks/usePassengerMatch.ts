import { useEffect, useRef, useState } from "react";

export const SEARCH_RADIUS_KM = { initial: 1, expanded: 3 } as const;
const EXPAND_AFTER_MS = 45_000;
/** Modo prueba: el conductor simulado acepta entre 10 y 15 s. */
const SIMULATED_ACCEPT_MIN_MS = 10_000;
const SIMULATED_ACCEPT_MAX_MS = 15_000;

/** Busca conductor mientras el pasajero tiene destino. El primero que acepta
 *  se queda con el viaje; si nadie acepta en 45 s, amplía el radio. */
export function usePassengerMatch({
  enabled,
  onMatched,
}: {
  enabled: boolean;
  onMatched: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "searching" | "matched">("idle");
  const [radiusKm, setRadiusKm] = useState<number>(SEARCH_RADIUS_KM.initial);
  const onMatchedRef = useRef(onMatched);
  useEffect(() => { onMatchedRef.current = onMatched; }, [onMatched]);

  useEffect(() => {
    if (!enabled) {
      setPhase("idle");
      setRadiusKm(SEARCH_RADIUS_KM.initial);
      return;
    }
    setPhase("searching");
    setRadiusKm(SEARCH_RADIUS_KM.initial);

    const acceptMs = SIMULATED_ACCEPT_MIN_MS + Math.random() * (SIMULATED_ACCEPT_MAX_MS - SIMULATED_ACCEPT_MIN_MS);
    const acceptTimer = setTimeout(() => {
      setPhase("matched");
      onMatchedRef.current();
    }, acceptMs);
    const expandTimer = setTimeout(() => setRadiusKm(SEARCH_RADIUS_KM.expanded), EXPAND_AFTER_MS);

    return () => {
      clearTimeout(acceptTimer);
      clearTimeout(expandTimer);
    };
  }, [enabled]);

  return { phase, radiusKm };
}
