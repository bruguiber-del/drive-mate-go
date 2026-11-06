// Lista quién está suspendido ahora mismo — a mano tras una denuncia, o en
// automático por la media de valoraciones semanal (ver
// suspend-low-rated-profiles). Sin esto, una suspensión automática no
// tenía dónde verse ni cómo revisarse a mano.
//
// Devuelve: { profiles: [{ id, fullName, averageRating, suspendedAt, suspensionReason }] }.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "no autenticado" }, 401);

  const { data: callerProfile } = await admin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!callerProfile?.is_admin) return json({ error: "no autorizado" }, 403);

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, average_rating, suspended_at, suspension_reason")
    .not("suspended_at", "is", null)
    .order("suspended_at", { ascending: false });

  return json({
    profiles: (profiles ?? []).map((p) => ({
      id: p.id,
      fullName: p.full_name ?? "(sin nombre)",
      averageRating: p.average_rating,
      suspendedAt: p.suspended_at,
      suspensionReason: p.suspension_reason,
    })),
  });
});
