import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { calculatePrice } from "@/lib/priceCalculator";

export default defineTool({
  name: "calculate_trip_price",
  title: "Calcular compensación por compartir gastos",
  description:
    "Calcula la compensación por compartir gastos de un trayecto con la fórmula de VIMATCH (coste por km, factor de ocupación, desvío, tráfico y comisión).",
  inputSchema: {
    distance_km: z.number().positive().describe("Distancia del trayecto en kilómetros."),
    passenger_count: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
      .describe("Número de pasajeros (1-4)."),
    detour_km: z.number().min(0).default(0).describe("Kilómetros extra de desvío del conductor."),
    traffic: z.enum(["normal", "moderate", "rush"]).default("normal")
      .describe("Factor de tráfico: normal, moderate u hora punta (rush)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ distance_km, passenger_count, detour_km, traffic }) => {
    const breakdown = calculatePrice({
      distanceKm: distance_km,
      passengerCount: passenger_count,
      detourKm: detour_km ?? 0,
      traffic: traffic ?? "normal",
    });
    return {
      content: [{ type: "text", text: JSON.stringify(breakdown) }],
      structuredContent: { breakdown },
    };
  },
});
