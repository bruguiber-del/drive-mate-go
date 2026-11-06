// Revisión semanal: suspende las cuentas que no llegan a una media de 2
// estrellas — antes nada apartaba a alguien problemático por mucho que la
// comunidad lo valorara mal una y otra vez. Pensada para lanzarse sola vía
// pg_cron (ver la migración que la programa); también se puede invocar a
// mano para probarla.
//
// Exige al menos MIN_RATINGS valoraciones antes de contar la media — una
// sola valoración mala (o una tanda de trolls) no debería bastar para
// suspender a nadie; hace falta un patrón real a lo largo de varios viajes.
// Ya suspendidos se saltan (no se vuelve a avisar cada semana de lo mismo).
//
// Devuelve: { suspended: number }.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_RATINGS = 3;
const THRESHOLD = 2;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function base64Url(value: string | undefined) {
  if (!value) return undefined;
  const clean = value.replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return clean || undefined;
}

async function pushTo(admin: ReturnType<typeof createClient>, userId: string, title: string, body: string, tag: string) {
  const vapidPublicKey = base64Url(Deno.env.get("VAPID_PUBLIC_KEY"));
  const vapidPrivateKey = base64Url(Deno.env.get("VAPID_PRIVATE_KEY"));
  if (!vapidPublicKey || !vapidPrivateKey) return;
  const webpush = (await import("npm:web-push@3")).default;
  webpush.setVapidDetails("mailto:soporte@vimatch.app", vapidPublicKey, vapidPrivateKey);
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  for (const sub of subs ?? []) {
    await webpush
      .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title, body, tag }))
      .catch(() => {});
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Quién tiene suficientes valoraciones como para que su media signifique
  // algo — menos de MIN_RATINGS no entra en la revisión en absoluto.
  const { data: allRatings } = await admin.from("ratings").select("rated_user_id");
  const counts = new Map<string, number>();
  for (const row of allRatings ?? []) counts.set(row.rated_user_id, (counts.get(row.rated_user_id) ?? 0) + 1);
  const eligibleIds = Array.from(counts.entries())
    .filter(([, count]) => count >= MIN_RATINGS)
    .map(([id]) => id);
  if (eligibleIds.length === 0) return json({ suspended: 0 });

  const { data: lowRated } = await admin
    .from("profiles")
    .select("id, full_name, average_rating")
    .in("id", eligibleIds)
    .lt("average_rating", THRESHOLD)
    .is("suspended_at", null);

  let suspended = 0;
  const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);

  for (const p of lowRated ?? []) {
    const reason = `Suspendida en automático: media de ${p.average_rating} estrellas (umbral mínimo ${THRESHOLD}).`;
    await admin.from("profiles").update({ suspended_at: new Date().toISOString(), suspension_reason: reason }).eq("id", p.id);
    suspended++;

    await pushTo(
      admin,
      p.id,
      "Tu cuenta ha sido suspendida",
      `Tu valoración media (${p.average_rating}★) está por debajo del mínimo. Necesitas una revisión manual para volver a usar VIMATCH.`,
      "suspended",
    ).catch(() => {});

    for (const a of admins ?? []) {
      await pushTo(
        admin,
        a.id,
        "⚠️ Cuenta suspendida por valoración baja",
        `${p.full_name ?? "Alguien"} ha quedado suspendido/a (${p.average_rating}★).`,
        "suspended-admin",
      ).catch(() => {});
    }
  }

  return json({ suspended });
});
