import { useState, useCallback, useEffect, useMemo, type RefObject } from "react";
import type { Waypoint } from "@/hooks/useWaypoints";
import { refineErrandPositions, insertErrandsStraight, errandDetourMinutes } from "@/lib/errandRouting";
import { useToast } from "@/components/ui/use-toast";

export interface ErrandStop {
  id: string;
  lat: number;
  lng: number;
  name: string;
}

/** Paradas personales (gasolinera, súper...) añadidas desde el buscador. Se
 *  colocan en la ruta sin alterar recogidas ni bajadas, se afinan con tiempo
 *  real y muestran cuántos minutos añade cada una. */
export function useErrandStops(base: Waypoint[], userLocRef: RefObject<[number, number] | null>) {
  const { toast } = useToast();
  const [extraStops, setExtraStops] = useState<ErrandStop[]>([]);

  const straightWaypoints = useMemo(() => {
    if (extraStops.length === 0) return base;
    const errandWaypoints: Waypoint[] = extraStops.map((s) => ({
      id: `errand-${s.id}`,
      type: "errand",
      lat: s.lat,
      lng: s.lng,
      name: s.name,
      completed: false,
    }));
    const finalIdx = base.findIndex((w) => w.type === "final_destination");
    const stopsBeforeFinal = finalIdx === -1 ? base : base.slice(0, finalIdx);
    const finalPart = finalIdx === -1 ? [] : base.slice(finalIdx);
    const origin = userLocRef.current;
    const ordered = insertErrandsStraight(
      origin ? { lat: origin[0], lng: origin[1] } : null,
      stopsBeforeFinal,
      errandWaypoints,
    );
    return [...ordered, ...finalPart];
  }, [base, extraStops, userLocRef]);

  const straightKey = useMemo(() => straightWaypoints.map((w) => w.id).join("|"), [straightWaypoints]);
  const [refinedWaypoints, setRefinedWaypoints] = useState<{ key: string; list: Waypoint[] } | null>(null);
  useEffect(() => {
    const origin = userLocRef.current;
    if (!origin || !straightWaypoints.some((w) => w.type === "errand")) return;
    let cancelled = false;
    refineErrandPositions({ lat: origin[0], lng: origin[1] }, straightWaypoints).then((list) => {
      if (!cancelled) setRefinedWaypoints({ key: straightKey, list });
    });
    return () => { cancelled = true; };
  }, [straightWaypoints, straightKey, userLocRef]);

  const effectiveWaypoints =
    refinedWaypoints && refinedWaypoints.key === straightKey ? refinedWaypoints.list : straightWaypoints;

  const [errandDetours, setErrandDetours] = useState<Record<string, number | null>>({});
  useEffect(() => {
    const origin = userLocRef.current;
    if (!origin || !effectiveWaypoints.some((w) => w.type === "errand")) {
      setErrandDetours({});
      return;
    }
    let cancelled = false;
    errandDetourMinutes({ lat: origin[0], lng: origin[1] }, effectiveWaypoints).then((detours) => {
      if (!cancelled) setErrandDetours(detours);
    });
    return () => { cancelled = true; };
  }, [effectiveWaypoints, userLocRef]);

  const addExtraStop = useCallback(
    (name: string, coords: { lng: number; lat: number }) => {
      setExtraStops((prev) => [...prev, { id: crypto.randomUUID(), lat: coords.lat, lng: coords.lng, name }]);
      toast({ title: `Parada añadida: ${name}`, description: "Se suma a tu ruta actual", duration: 1800 });
    },
    [toast],
  );

  const removeExtraStop = useCallback((id: string) => {
    setExtraStops((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { extraStops, setExtraStops, addExtraStop, removeExtraStop, effectiveWaypoints, errandDetours };
}
