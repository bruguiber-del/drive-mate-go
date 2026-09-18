import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { assertTripParticipant } from "../tripAccess";

export default defineTool({
  name: "get_driver_location",
  title: "Última ubicación del conductor",
  description: "Devuelve la última posición GPS registrada del conductor de un viaje.",
  inputSchema: {
    trip_id: z.string().uuid().describe("Identificador UUID del viaje."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ trip_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "No autenticado" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);

    const denial = await assertTripParticipant(supabase, trip_id);
    if (denial) return denial;

    const { data, error } = await supabase
      .from("driver_locations")
      .select("latitude, longitude, heading, speed, accuracy, created_at")
      .eq("trip_id", trip_id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data || data.length === 0) {
      return { content: [{ type: "text", text: `Sin ubicaciones para el viaje ${trip_id}.` }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data[0]) }],
      structuredContent: { location: data[0] },
    };
  },
});
