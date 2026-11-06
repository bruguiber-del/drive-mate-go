// Marca una denuncia como revisada/descartada y, si hace falta, suspende o
// reactiva a mano la cuenta de quien fue denunciado — la revisión manual
// que necesita alguien para volver a usar VIMATCH después de una
// suspensión (automática por valoración baja, o directa desde aquí) pasa
// por aquí.
//
// Recibe: { reportId, status: 'reviewed' | 'dismissed', suspendUser?,
//   reactivateUser? }. Devuelve: { ok: true }.

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
  const { reportId, status, suspendUser, reactivateUser } = (await req.json().catch(() => ({}))) as {
    reportId?: string;
    status?: "reviewed" | "dismissed";
    suspendUser?: boolean;
    reactivateUser?: boolean;
  };
  if (!reportId || (status !== "reviewed" && status !== "dismissed")) {
    return json({ error: "falta reportId o status inválido" }, 400);
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

  const { data: report } = await admin
    .from("reports")
    .select("id, reported_user_id")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return json({ error: "denuncia no encontrada" }, 404);

  await admin.from("reports").update({ status, reviewed_at: new Date().toISOString() }).eq("id", reportId);

  if (report.reported_user_id && suspendUser) {
    await admin
      .from("profiles")
      .update({ suspended_at: new Date().toISOString(), suspension_reason: "Suspendida a mano tras revisar una denuncia SOS." })
      .eq("id", report.reported_user_id);
  }
  if (report.reported_user_id && reactivateUser) {
    await admin
      .from("profiles")
      .update({ suspended_at: null, suspension_reason: null })
      .eq("id", report.reported_user_id);
  }

  return json({ ok: true });
});
