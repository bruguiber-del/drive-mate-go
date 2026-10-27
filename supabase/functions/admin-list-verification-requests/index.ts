// Lista las solicitudes de verificación pendientes de revisión humana —
// las que la IA no pudo aprobar ni rechazar sola (needs_review) y, por si
// acaso, las que se quedaron sin pasar por la IA (pending). Incluye una URL
// firmada de la foto (el bucket es privado, cada usuario solo puede leer
// la suya propia — aquí se genera con la service role para que quien
// revisa pueda verla).
//
// Devuelve: { requests: [{ id, kind, status, reason, createdAt, userName,
//   userPhone, vehicleBrand, vehicleModel, licensePlate, photoUrl }] }.

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

  const { data: requests } = await admin
    .from("verification_requests")
    .select("id, user_id, kind, vehicle_id, storage_path, status, reason, created_at")
    .in("status", ["pending", "needs_review"])
    .order("created_at", { ascending: true });

  const result = [];
  for (const r of requests ?? []) {
    const { data: signed } = await admin.storage
      .from("verification-docs")
      .createSignedUrl(r.storage_path, 600);

    const { data: requesterProfile } = await admin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", r.user_id)
      .maybeSingle();

    let vehicleBrand: string | null = null;
    let vehicleModel: string | null = null;
    let licensePlate: string | null = null;
    if (r.vehicle_id) {
      const { data: v } = await admin
        .from("vehicles")
        .select("brand, model, license_plate")
        .eq("id", r.vehicle_id)
        .maybeSingle();
      if (v) {
        vehicleBrand = v.brand;
        vehicleModel = v.model;
        licensePlate = v.license_plate;
      }
    }

    result.push({
      id: r.id,
      kind: r.kind,
      status: r.status,
      reason: r.reason,
      createdAt: r.created_at,
      userName: requesterProfile?.full_name ?? "(sin nombre)",
      userPhone: requesterProfile?.phone ?? null,
      vehicleBrand,
      vehicleModel,
      licensePlate,
      photoUrl: signed?.signedUrl ?? null,
    });
  }

  return json({ requests: result });
});
