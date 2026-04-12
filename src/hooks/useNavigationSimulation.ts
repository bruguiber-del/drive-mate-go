import { useState, useEffect, useRef, useCallback } from 'react';

interface UseNavigationSimulationOptions {
  routeCoordinates: [number, number][] | null;
  enabled: boolean;
  speedMultiplier?: number; // 1 = real-time, 10 = 10x speed
}

export function useNavigationSimulation({
  routeCoordinates,
  enabled,
  speedMultiplier = 15,
}: UseNavigationSimulationOptions) {
  const [simulatedPosition, setSimulatedPosition] = useState<[number, number] | null>(null);
  const [simulatedHeading, setSimulatedHeading] = useState<number>(0);
  const [progress, setProgress] = useState(0); // 0 to 1
  const [isSimulating, setIsSimulating] = useState(false);
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const totalDistRef = useRef<number>(0);
  const segmentsRef = useRef<{ start: [number, number]; end: [number, number]; dist: number; cumDist: number }[]>([]);

  // Pre-compute segments
  useEffect(() => {
    if (!routeCoordinates || routeCoordinates.length < 2) {
      segmentsRef.current = [];
      totalDistRef.current = 0;
      return;
    }

    let totalDist = 0;
    const segs: typeof segmentsRef.current = [];
    for (let i = 0; i < routeCoordinates.length - 1; i++) {
      const [lat1, lng1] = routeCoordinates[i];
      const [lat2, lng2] = routeCoordinates[i + 1];
      const d = Math.sqrt((lat2 - lat1) ** 2 + (lng2 - lng1) ** 2);
      totalDist += d;
      segs.push({ start: routeCoordinates[i], end: routeCoordinates[i + 1], dist: d, cumDist: totalDist });
    }
    segmentsRef.current = segs;
    totalDistRef.current = totalDist;
  }, [routeCoordinates]);

  const getPositionAtProgress = useCallback((p: number): { pos: [number, number]; heading: number } | null => {
    const segs = segmentsRef.current;
    const total = totalDistRef.current;
    if (!segs.length || total === 0) return null;

    const targetDist = p * total;
    for (const seg of segs) {
      if (targetDist <= seg.cumDist) {
        const segStart = seg.cumDist - seg.dist;
        const t = seg.dist > 0 ? (targetDist - segStart) / seg.dist : 0;
        const lat = seg.start[0] + t * (seg.end[0] - seg.start[0]);
        const lng = seg.start[1] + t * (seg.end[1] - seg.start[1]);
        const dLng = seg.end[1] - seg.start[1];
        const dLat = seg.end[0] - seg.start[0];
        const heading = (Math.atan2(dLng, dLat) * 180) / Math.PI;
        return { pos: [lat, lng], heading };
      }
    }

    const last = segs[segs.length - 1];
    return { pos: last.end, heading: 0 };
  }, []);

  // Animation loop
  useEffect(() => {
    if (!enabled || !routeCoordinates || routeCoordinates.length < 2) {
      setIsSimulating(false);
      setSimulatedPosition(null);
      setProgress(0);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      return;
    }

    setIsSimulating(true);
    startTimeRef.current = performance.now();

    // Estimate total duration: assume ~50km/h average, coordinates in degrees
    // 1 degree ≈ 111km, so total distance in km = totalDist * 111
    const totalKm = totalDistRef.current * 111;
    const realDurationMs = (totalKm / 50) * 3600 * 1000; // at 50km/h
    const simDurationMs = realDurationMs / speedMultiplier;

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const p = Math.min(elapsed / simDurationMs, 1);
      setProgress(p);

      const result = getPositionAtProgress(p);
      if (result) {
        setSimulatedPosition(result.pos);
        setSimulatedHeading(result.heading);
      }

      if (p < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setIsSimulating(false);
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [enabled, routeCoordinates, speedMultiplier, getPositionAtProgress]);

  return {
    simulatedPosition,
    simulatedHeading,
    progress,
    isSimulating,
  };
}
