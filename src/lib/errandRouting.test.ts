import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Waypoint } from "@/hooks/useWaypoints";
import { refineErrandPositions } from "./errandRouting";

const wp = (id: string, type: Waypoint["type"], lng: number): Waypoint => ({
  id, type, lat: 0, lng, name: id, completed: false,
});

// Duración simulada: longitud del trayecto en línea recta a través de los
// puntos pedidos, así el test no depende de la red.
function fakeFetch() {
  return vi.fn(async (url: string) => {
    const coords = url.split("?")[0].split("/").pop()!.split(";").map((c) => c.split(",").map(Number));
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
      total += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    }
    return { ok: true, json: async () => ({ routes: [{ duration: total * 1000, distance: total * 1000 }] }) };
  });
}

describe("refineErrandPositions", () => {
  beforeEach(() => { vi.stubGlobal("fetch", fakeFetch()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("moves an errand to the cheaper position without breaking pickup/final order", async () => {
    const origin = { lat: 0, lng: 0 };
    const ordered = [wp("pickup", "pickup", 1), wp("errand", "errand", 0.5), wp("final", "final_destination", 3)];
    const result = await refineErrandPositions(origin, ordered);
    expect(result.map((w) => w.id)).toEqual(["errand", "pickup", "final"]);
  });

  it("keeps the input order when Mapbox does not answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    const ordered = [wp("pickup", "pickup", 1), wp("errand", "errand", 0.5), wp("final", "final_destination", 3)];
    // Otro origen: la caché de rutas no debe devolver la respuesta del test anterior.
    const result = await refineErrandPositions({ lat: 1, lng: 1 }, ordered);
    expect(result.map((w) => w.id)).toEqual(["pickup", "errand", "final"]);
  });
});
