// Borra la cuenta del usuario que llama y todos sus datos personales —
// RGPD exige poder ejercer el derecho al olvido desde la propia app, no
// solo pidiéndolo por correo.
//
// Recibe: nada (usa el token de quien llama). Devuelve: { ok: true }.
//
// Sin claves foráneas reales hacia auth.users (la plataforma no las
// permite), borrar la cuenta de auth no arrastra nada solo — hay que
// borrar cada tabla a mano antes de borrar la cuenta en sí.

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
  const userId = user.id;

  // Fotos de carnet/matrícula subidas para verificación — datos sensibles,
  // se borran antes que la fila que las referencia.
  const { data: files } = await admin.storage.from("verification-docs").list(userId);
  if (files && files.length > 0) {
    await admin.storage.from("verification-docs").remove(files.map((f) => `${userId}/${f.name}`));
  }

  // Lo que es solo tuyo: se borra sin más.
  await Promise.all([
    admin.from("vehicles").delete().eq("user_id", userId),
    admin.from("driver_locations").delete().eq("driver_id", userId),
    admin.from("push_subscriptions").delete().eq("user_id", userId),
    admin.from("verification_requests").delete().eq("user_id", userId),
    admin.from("recurring_trips").delete().eq("user_id", userId),
  ]);

  // Valoraciones donde apareces, como quien valora o como valorado.
  await admin.from("ratings").delete().or(`rater_id.eq.${userId},rated_user_id.eq.${userId}`);

  // Tus peticiones como pasajero en viajes de otros conductores.
  await admin.from("trip_passengers").delete().eq("passenger_id", userId);

  // Tus propios viajes como conductor — arrastra en cascada sus filas de
  // trip_passengers (pasajeros que iban contigo), así que sus peticiones
  // en ESE viaje concreto desaparecen con él.
  await admin.from("trips").delete().eq("driver_id", userId);

  await admin.from("profiles").delete().eq("id", userId);

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) return json({ error: authError.message }, 500);

  return json({ ok: true });
});
