import { useCallback, useEffect, useRef, useState } from "react";

export const SEARCH_RADIUS_KM = { initial: 1, expanded: 3 } as const;
const EXPAND_AFTER_MS = 45_000;
/** Si exiges puerta a puerta y no aparece nadie que la haga en este tiempo,
 *  se pregunta si prefieres quitar esa condición en vez de seguir esperando
 *  en silencio. */
const DOOR_TO_DOOR_TIMEOUT_MS = 5 * 60_000;
/** Si NO exiges puerta a puerta, cuánto se espera antes de avisar de que no
 *  hay nadie cerca. */
const GIVE_UP_AFTER_MS = 120_000;
/** Modo prueba: cada intento de emparejar pasa entre 10 y 15 s. */
const ATTEMPT_MIN_MS = 10_000;
const ATTEMPT_MAX_MS = 15_000;

export type PassengerMatchPhase =
  | "idle"
  | "searching"
  | "matched"
  | "not_found"
  | "door_to_door_unavailable";

/** Busca conductor mientras el pasajero tiene destino. Cada intento llama a
 *  `attemptMatch`, que decide si el candidato encontrado vale (por ejemplo,
 *  si exiges puerta a puerta y este conductor no la hace, se descarta y se
 *  sigue buscando) — true si se queda con el viaje, false si hay que
 *  reintentar. Si nadie acepta en 45 s, amplía el radio; si exiges puerta a
 *  puerta y nadie la ofrece en 5 min, para de reintentar sola y deja que
 *  quien llama decida (seguir exigiéndola o no). */
export function usePassengerMatch({
  enabled,
  requireDoorToDoor,
  attemptMatch,
}: {
  enabled: boolean;
  requireDoorToDoor: boolean;
  /** Devuelve true si este intento encontró un conductor válido. */
  attemptMatch: () => boolean;
}) {
  const [phase, setPhase] = useState<PassengerMatchPhase>("idle");
  const [radiusKm, setRadiusKm] = useState<number>(SEARCH_RADIUS_KM.initial);
  const [attempt, setAttempt] = useState(0);
  const attemptMatchRef = useRef(attemptMatch);
  useEffect(() => { attemptMatchRef.current = attemptMatch; }, [attemptMatch]);
  const requireDoorToDoorRef = useRef(requireDoorToDoor);
  useEffect(() => { requireDoorToDoorRef.current = requireDoorToDoor; }, [requireDoorToDoor]);

  useEffect(() => {
    if (!enabled) {
      setPhase("idle");
      setRadiusKm(SEARCH_RADIUS_KM.initial);
      return;
    }
    setPhase("searching");
    setRadiusKm(SEARCH_RADIUS_KM.initial);

    let cancelled = false;
    let elapsedMs = 0;

    const scheduleNext = () => {
      const delay = ATTEMPT_MIN_MS + Math.random() * (ATTEMPT_MAX_MS - ATTEMPT_MIN_MS);
      const timer = setTimeout(() => {
        if (cancelled) return;
        elapsedMs += delay;
        if (elapsedMs >= EXPAND_AFTER_MS) setRadiusKm(SEARCH_RADIUS_KM.expanded);

        const matched = attemptMatchRef.current();
        if (matched) {
          setPhase("matched");
          return;
        }
        if (requireDoorToDoorRef.current && elapsedMs >= DOOR_TO_DOOR_TIMEOUT_MS) {
          setPhase("door_to_door_unavailable");
          return;
        }
        if (!requireDoorToDoorRef.current && elapsedMs >= GIVE_UP_AFTER_MS) {
          setPhase("not_found");
          return;
        }
        scheduleNext();
      }, delay);
      timerRef.current = timer;
    };
    const timerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };
    scheduleNext();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, attempt]);

  // Reinicia la búsqueda desde cero (radio inicial, otros 45s/2min/5min)
  // sin que el destino tenga que cambiar — para "Reintentar" y para
  // "Seguir buscando puerta a puerta" / "Buscar sin puerta a puerta".
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { phase, radiusKm, retry };
}
