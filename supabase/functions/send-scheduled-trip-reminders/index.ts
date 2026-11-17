// Aviso push de "¿vas a X ahora?" para viajes habituales y programados,
// para cuando la app está cerrada o en segundo plano — el aviso DENTRO de
// la app (useRecurringTripReminder/useScheduledTripReminder) solo puede
// saltar con la app abierta mirando la pantalla; esto es la otra mitad,
// pensada para lanzarse sola vía pg_cron cada minuto (ver la migración que
// la programa).
//
// Mismas ventanas que el aviso del cliente: desde 30 min antes de la hora
// hasta 15 min después. Cada viaje se marca al avisarlo (last_reminded_date
// en recurring_trips, por día; reminder_sent_at en trips, una sola vez) para
// no mandar el mismo aviso en cada tick del minuto mientras siga dentro de
// la ventana.
//
// Los viajes habituales se guardan solo como hora+días de la semana, sin
// zona horaria — se asume Europe/Madrid (todo el uso real de la app es en
// España) en vez de guardar la zona de cada usuario, que habría sido un
// cambio de esquema mucho más grande para esto.
//
// Devuelve: { remindedRecurring: number, remindedScheduled: number }.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WINDOW_BEFORE_MIN = 30;
const WINDOW_AFTER_MIN = 15;
const APP_TIMEZONE = "Europe/Madrid";

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

/** Día de la semana (0=domingo) y minutos desde medianoche, en hora local
 *  de Madrid — Intl ya resuelve el cambio de horario de verano solo. */
function madridNow(now: Date): { dow: number; minutesOfDay: number; dateKey: string } {
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const timeStr = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const [hh, mm] = timeStr.split(":").map(Number);
  // El día de la semana depende solo de la fecha (no de la hora), así que
  // se puede sacar de dateKey tratándolo como medianoche UTC sin más lío.
  const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return { dow, minutesOfDay: hh * 60 + mm, dateKey };
}

function isRecurringDueNow(trip: { active: boolean; days_of_week: number[]; departure_time: string }, mn: ReturnType<typeof madridNow>): boolean {
  if (!trip.active || !trip.days_of_week.includes(mn.dow)) return false;
  const [h, m] = trip.departure_time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  const depMinutes = h * 60 + m;
  return mn.minutesOfDay >= depMinutes - WINDOW_BEFORE_MIN && mn.minutesOfDay <= depMinutes + WINDOW_AFTER_MIN;
}

function isScheduledDueNow(scheduledAt: string, now: Date): boolean {
  const diffMin = (new Date(scheduledAt).getTime() - now.getTime()) / 60_000;
  return diffMin <= WINDOW_BEFORE_MIN && diffMin >= -WINDOW_AFTER_MIN;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Igual que suspend-low-rated-profiles: esto no lo llama ningún usuario
  // con sesión, solo pg_cron por horario — sin esta comprobación, la URL
  // (pública en el repo) se podría invocar a mano sin pasar por el cron.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return json({ error: "no autorizado" }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, serviceRoleKey);
  const now = new Date();
  const mn = madridNow(now);

  let remindedRecurring = 0;
  const { data: recurringTrips } = await admin
    .from("recurring_trips")
    .select("id, user_id, destination_name, active, days_of_week, departure_time, last_reminded_date");
  for (const t of recurringTrips ?? []) {
    if (t.last_reminded_date === mn.dateKey) continue;
    if (!isRecurringDueNow(t, mn)) continue;
    await pushTo(admin, t.user_id, `¿Vas a ${t.destination_name} ahora?`, "Tu viaje habitual está a punto de empezar.", `recurring-${t.id}`);
    await admin.from("recurring_trips").update({ last_reminded_date: mn.dateKey }).eq("id", t.id);
    remindedRecurring++;
  }

  let remindedScheduled = 0;
  const { data: scheduledTrips } = await admin
    .from("trips")
    .select("id, driver_id, destination_name, scheduled_at, reminder_sent_at")
    .eq("status", "scheduled")
    .is("passenger_id", null)
    .is("reminder_sent_at", null);
  for (const t of scheduledTrips ?? []) {
    if (!t.scheduled_at || !isScheduledDueNow(t.scheduled_at, now)) continue;
    await pushTo(admin, t.driver_id, `¿Vas a ${t.destination_name} ahora?`, "Tu viaje programado está a punto de empezar.", `scheduled-${t.id}`);
    await admin.from("trips").update({ reminder_sent_at: now.toISOString() }).eq("id", t.id);
    remindedScheduled++;
  }

  return json({ remindedRecurring, remindedScheduled });
});
