import type { SupabaseClient } from "@supabase/supabase-js";

type Denial = {
  content: { type: "text"; text: string }[];
  isError: true;
};

/**
 * Verifies that the signed-in user is the driver or the passenger of the trip.
 * Returns a denial payload when access must be refused, or null when allowed.
 * RLS already restricts `trips` to participants, so an empty result means "not a participant".
 */
export async function assertTripParticipant(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  tripId: string,
): Promise<Denial | null> {
  const { data: user, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.user) {
    return { content: [{ type: "text", text: "No autenticado" }], isError: true };
  }

  const { data, error } = await supabase
    .from("trips")
    .select("id, driver_id, passenger_id")
    .eq("id", tripId)
    .maybeSingle();

  if (error) {
    return { content: [{ type: "text", text: error.message }], isError: true };
  }

  const uid = user.user.id;
  if (!data || (data.driver_id !== uid && data.passenger_id !== uid)) {
    return {
      content: [{ type: "text", text: "No autorizado: no participas en este viaje." }],
      isError: true,
    };
  }

  return null;
}
