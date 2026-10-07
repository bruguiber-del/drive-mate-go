import { useCallback, useEffect, useRef, useState } from "react";

export const SEARCH_RADIUS_KM = { initial: 1, expanded: 3 } as const;
const EXPAND_AFTER_MS = 45_000;
/** Si tras esto nadie ha aceptado (ni siquiera con el radio ampliado), se
 *  avisa en vez de dejar al pasajero esperando sin saber qué pasa. */
const GIVE_UP_AFTER_MS = 120_000;
/** Modo prueba: el conductor simulado acepta entre 10 y 15 s. */
const SIMULATED_ACCEPT_MIN_MS = 10_000;
const SIMULATED_ACCEPT_MAX_MS = 15_000;

/** Busca conductor mientras el pasajero tiene destino. El primero que acepta
 *  se queda con el viaje; si nadie acepta en 45 s, amplía el radio; si nadie
 *  acepta en 2 min, avisa de que no hay nadie en vez de seguir en silencio. */
export function usePassengerMatch({
  enabled,
  onMatched,
}: {
  enabled: boolean;
  onMatched: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "searching" | "matched" | "not_found">("idle");
  const [radiusKm, setRadiusKm] = useState<number>(SEARCH_RADIUS_KM.initial);
  const [attempt, setAttempt] = useState(0);
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
    const giveUpTimer = setTimeout(() => setPhase("not_found"), GIVE_UP_AFTER_MS);

    return () => {
      clearTimeout(acceptTimer);
      clearTimeout(expandTimer);
      clearTimeout(giveUpTimer);
    };
  }, [enabled, attempt]);

  // Reinicia la búsqueda desde cero (radio inicial, otros 45s/2min) sin que
  // el destino tenga que cambiar — para el botón "Reintentar".
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { phase, radiusKm, retry };
}
