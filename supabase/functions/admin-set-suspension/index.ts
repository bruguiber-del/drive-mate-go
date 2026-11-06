// Suspende o reactiva a mano la cuenta de cualquier usuario por su id —
// para reactivar a alguien que quedó suspendido en automático (ver
// suspend-low-rated-profiles), que no tiene ninguna denuncia asociada a la
// que enganchar la reactivación de admin-resolve-report.
//
// Recibe: { userId, suspended: boolean, reason? }. Devuelve: { ok: true }.

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
  const { userId, suspended, reason } = (await req.json().catch(() => ({}))) as {
    userId?: string;
    suspended?: boolean;
    reason?: string;
  };
  if (!userId || typeof suspended !== "boolean") return json({ error: "falta userId o suspended" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: userData } = await userClient.auth.getUser();
  const caller = userData?.user;
  if (!caller) return json({ error: "no autenticado" }, 401);

  const { data: callerProfile } = await admin.from("profiles").select("is_admin").eq("id", caller.id).maybeSingle();
  if (!callerProfile?.is_admin) return json({ error: "no autorizado" }, 403);

  await admin
    .from("profiles")
    .update(
      suspended
        ? { suspended_at: new Date().toISOString(), suspension_reason: reason || "Suspendida a mano por un admin." }
        : { suspended_at: null, suspension_reason: null },
    )
    .eq("id", userId);

  return json({ ok: true });
});
