// Manda un aviso push a todas las suscripciones de un usuario — sin esto,
// enterarse de una petición nueva o de que te han aceptado dependía de
// tener la app abierta mirando la pantalla.
//
// Recibe: { tripId, targetUserId, title, body, tag? }. Por seguridad, solo
// deja mandar el aviso si quien llama Y a quien va dirigido son los dos
// participantes (driver_id / passenger_id) del MISMO viaje — evita que
// cualquiera pueda mandarle notificaciones a cualquiera.
// Devuelve: { sent: number }.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

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

// Algunas claves se pegan en base64 "clásico" (con + y /) o con saltos de
// línea, y web-push solo admite base64url: si no, revienta al validarlas.
function base64Url(value: string | undefined) {
  if (!value) return undefined;
  const clean = value
    .replace(/\s+/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return clean || undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const vapidPublicKey = base64Url(Deno.env.get("VAPID_PUBLIC_KEY"));
  const vapidPrivateKey = base64Url(Deno.env.get("VAPID_PRIVATE_KEY"));
  if (!vapidPublicKey || !vapidPrivateKey) {
    return json({ error: "Push no configurado (faltan las claves VAPID)" }, 500);
  }

  // La clave pública no es secreta: la app la pide aquí en vez de llevarla
  // incrustada en el código.
  if (req.method === "GET") return json({ publicKey: vapidPublicKey });

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  webpush.setVapidDetails("mailto:soporte@vimatch.app", vapidPublicKey, vapidPrivateKey);

  const authHeader = req.headers.get("Authorization") ?? "";
  const { tripId, targetUserId, title, body, tag } = (await req.json().catch(() => ({}))) as {
    tripId?: string;
    targetUserId?: string;
    title?: string;
    body?: string;
    tag?: string;
  };
  if (!tripId || !targetUserId || !title) return json({ error: "falta tripId, targetUserId o title" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: userData } = await userClient.auth.getUser();
  const caller = userData?.user;
  if (!caller) return json({ error: "no autenticado" }, 401);

  const { data: trip } = await admin.from("trips").select("driver_id").eq("id", tripId).maybeSingle();
  if (!trip) return json({ error: "viaje no encontrado" }, 404);

  const participantIds = new Set<string>([trip.driver_id]);
  const { data: passengerRows } = await admin.from("trip_passengers").select("passenger_id").eq("trip_id", tripId);
  for (const p of passengerRows ?? []) if (p.passenger_id) participantIds.add(p.passenger_id);

  if (!participantIds.has(caller.id) || !participantIds.has(targetUserId)) {
    return json({ error: "no autorizado para este viaje" }, 403);
  }

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", targetUserId);

  let sent = 0;
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, tag }),
      );
      sent++;
    } catch (err) {
      // Suscripción caducada/inválida (410/404) — se borra para no
      // reintentarla siempre y fallar en vano.
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }

  return json({ sent });
});
