// Lista las denuncias del botón SOS pendientes de revisar — sin esto, un
// admin no tenía dónde ver lo que se mandaba desde submit-report más allá
// del aviso push/email/WhatsApp del momento.
//
// Devuelve: { reports: [{ id, kind, description, status, createdAt,
//   reporterName, reportedName, reportedUserId, reportedSuspended, tripId }] }.

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

  const { data: reports } = await admin
    .from("reports")
    .select("id, reporter_id, reported_user_id, trip_id, kind, description, status, created_at")
    .order("created_at", { ascending: false });

  const result = [];
  for (const r of reports ?? []) {
    const { data: reporterProfile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", r.reporter_id)
      .maybeSingle();

    let reportedName: string | null = null;
    let reportedSuspended = false;
    if (r.reported_user_id) {
      const { data: reportedProfile } = await admin
        .from("profiles")
        .select("full_name, suspended_at")
        .eq("id", r.reported_user_id)
        .maybeSingle();
      reportedName = reportedProfile?.full_name ?? "(sin nombre)";
      reportedSuspended = !!reportedProfile?.suspended_at;
    }

    result.push({
      id: r.id,
      kind: r.kind,
      description: r.description,
      status: r.status,
      createdAt: r.created_at,
      reporterName: reporterProfile?.full_name ?? "(sin nombre)",
      reportedName,
      reportedUserId: r.reported_user_id,
      reportedSuspended,
      tripId: r.trip_id,
    });
  }

  return json({ reports: result });
});
