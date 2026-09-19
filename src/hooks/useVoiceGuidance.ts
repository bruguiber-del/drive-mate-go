import { useCallback, useEffect, useRef, useState } from 'react';
import type { RouteStep } from '@/hooks/useRouting';

const STORAGE_KEY = 'vimatch_voice_muted';

const EARTH_R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

function distanceMeters(a: [number, number], b: [number, number]) {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

interface Options {
  steps?: RouteStep[] | null;
  userLocation: [number, number] | null;
  /** Only speak while actually navigating */
  enabled: boolean;
}

/**
 * Turn-by-turn voice guidance using the browser Web Speech API (es-ES).
 * Muted by default the first time (mobile browsers block autoplay audio).
 */
export function useVoiceGuidance({ steps, userLocation, enabled }: Options) {
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === null ? true : saved === '1';
    } catch {
      return true;
    }
  });

  /** Announcements already spoken, keyed by maneuver location + text */
  const spokenRef = useRef<Set<string>>(new Set());

  const cancelSpeech = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch { /* noop */ }
  }, []);

  const speak = useCallback((text: string) => {
    if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-ES';
    utter.rate = 1;
    window.speechSynthesis.speak(utter);
  }, []);

  const toggleMuted = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* noop */ }
      if (next) {
        try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
      } else {
        // First unmute doubles as the user gesture that unlocks audio.
        const u = new SpeechSynthesisUtterance('Guía por voz activada');
        u.lang = 'es-ES';
        try { window.speechSynthesis?.speak(u); } catch { /* noop */ }
      }
      return next;
    });
  }, []);

  // Reset spoken announcements whenever the route changes or nav stops.
  useEffect(() => {
    spokenRef.current = new Set();
  }, [steps]);

  useEffect(() => {
    if (!enabled) {
      spokenRef.current = new Set();
      cancelSpeech();
    }
  }, [enabled, cancelSpeech]);

  // "Calienta" el motor de voz en cuanto arranca la navegación, en vez de
  // esperar al primer aviso real: en varios navegadores (sobre todo Chrome)
  // la lista de voces se carga de forma asíncrona, y la primerísima llamada
  // a speak() se queda esperando a que esa lista esté lista — lo que se
  // nota como un retraso justo en el aviso más importante, el primero.
  useEffect(() => {
    if (!enabled || isMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (window.speechSynthesis.getVoices().length > 0) return;
    const onVoicesReady = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesReady);
    // Dispara la carga; en algunos navegadores basta con esta primera llamada.
    window.speechSynthesis.getVoices();
    return () => window.speechSynthesis.removeEventListener('voiceschanged', onVoicesReady);
  }, [enabled, isMuted]);

  // Compare distance to the upcoming maneuver against Mapbox's
  // distanceAlongGeometry thresholds and announce each one exactly once.
  useEffect(() => {
    if (!enabled || isMuted || !userLocation || !steps?.length) return;

    // Nearest maneuver ahead: pick the closest step with voice instructions.
    let best: { step: RouteStep; dist: number } | null = null;
    for (const step of steps) {
      const loc = step.maneuver?.location;
      if (!loc || !step.voiceInstructions?.length) continue;
      const d = distanceMeters(userLocation, [loc[1], loc[0]]);
      if (!best || d < best.dist) best = { step, dist: d };
    }
    if (!best) return;

    const loc = best.step.maneuver.location;
    const key = `${loc[0].toFixed(5)},${loc[1].toFixed(5)}`;

    // Announce every threshold already crossed (farthest first), once each.
    const pending = (best.step.voiceInstructions ?? [])
      .filter(v => best!.dist <= v.distanceAlongGeometry)
      .sort((a, b) => b.distanceAlongGeometry - a.distanceAlongGeometry);

    for (const v of pending) {
      const id = `${key}|${v.distanceAlongGeometry}|${v.announcement}`;
      if (spokenRef.current.has(id)) continue;
      spokenRef.current.add(id);
      speak(v.announcement);
    }
  }, [userLocation, steps, enabled, isMuted, speak]);

  return { isMuted, toggleMuted, cancelSpeech };
}
