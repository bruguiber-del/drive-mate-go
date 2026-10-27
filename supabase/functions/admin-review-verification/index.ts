// Aprueba o rechaza a mano una solicitud de verificación que la IA dejó en
// needs_review (o pending). Mismo efecto que el aprobado automático de
// verify-document: si se aprueba un vehículo, marca vehicles.verification_status
// como 'verified'.
//
// Recibe: { requestId, decision: 'approved' | 'rejected', reason? }.
// Devuelve: { ok: true }.

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
  const { requestId, decision, reason } = (await req.json().catch(() => ({}))) as {
    requestId?: string;
    decision?: "approved" | "rejected";
    reason?: string;
  };
  if (!requestId || (decision !== "approved" && decision !== "rejected")) {
    return json({ error: "falta requestId o decision inválida" }, 400);
  }

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

  const { data: request } = await admin
    .from("verification_requests")
    .select("id, kind, vehicle_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return json({ error: "solicitud no encontrada" }, 404);

  await admin
    .from("verification_requests")
    .update({ status: decision, reason: reason ?? "Revisado a mano", reviewed_at: new Date().toISOString() })
    .eq("id", requestId);

  if (decision === "approved" && request.kind === "vehicle" && request.vehicle_id) {
    await admin.from("vehicles").update({ verification_status: "verified" }).eq("id", request.vehicle_id);
  }

  return json({ ok: true });
});
