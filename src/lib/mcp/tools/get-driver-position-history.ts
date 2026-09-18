import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { assertTripParticipant } from "../tripAccess";

export default defineTool({
  name: "get_driver_position_history",
  title: "Histórico de posiciones del conductor",
  description: "Devuelve el histórico reciente de posiciones GPS de un viaje, de más nueva a más antigua.",
  inputSchema: {
    trip_id: z.string().uuid().describe("Identificador UUID del viaje."),
    limit: z.number().int().min(1).max(200).default(30).describe("Número máximo de posiciones a devolver."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ trip_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "No autenticado" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);

    const denial = await assertTripParticipant(supabase, trip_id);
    if (denial) return denial;

    const { data, error } = await supabase
      .from("driver_locations")
      .select("latitude, longitude, created_at")
      .eq("trip_id", trip_id)
      .order("created_at", { ascending: false })
      .limit(limit ?? 30);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { positions: data ?? [] },
    };
  },
});
