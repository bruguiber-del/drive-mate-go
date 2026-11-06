// Botón SOS — denuncia un accidente o el mal comportamiento de alguien del
// viaje. Antes no había ninguna forma de avisar de esto desde la app. Igual
// que verify-document con needs_review, avisa a los admins por los tres
// canales en cuanto se manda, porque esto es justo el tipo de aviso que no
// puede esperar a que alguien entre a mirar el panel por su cuenta.
//
// Recibe: { kind, description, tripId?, reportedUserId? }.
// Devuelve: { ok: true }.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KINDS = ["accidente", "conductor", "pasajero", "otro"] as const;
const KIND_LABEL: Record<(typeof KINDS)[number], string> = {
  accidente: "un accidente",
  conductor: "el comportamiento de un conductor",
  pasajero: "el comportamiento de un pasajero",
  otro: "algo",
};

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

async function notifyAdminsOfReport(
  admin: ReturnType<typeof createClient>,
  reporterName: string,
  kind: string,
  description: string,
) {
  const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
  if (!admins?.length) return;

  const label = KIND_LABEL[kind as (typeof KINDS)[number]] ?? "algo";
  const title = "🚨 Aviso SOS en VIMATCH";
  const body = `${reporterName} ha denunciado ${label}: ${description.slice(0, 140)}`;

  const vapidPublicKey = base64Url(Deno.env.get("VAPID_PUBLIC_KEY"));
  const vapidPrivateKey = base64Url(Deno.env.get("VAPID_PRIVATE_KEY"));
  if (vapidPublicKey && vapidPrivateKey) {
    const webpush = (await import("npm:web-push@3")).default;
    webpush.setVapidDetails("mailto:soporte@vimatch.app", vapidPublicKey, vapidPrivateKey);
    for (const a of admins) {
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", a.id);
      for (const sub of subs ?? []) {
        await webpush
          .sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title, body, tag: "sos" }),
          )
          .catch(() => {});
      }
    }
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (resendApiKey) {
    for (const a of admins) {
      const { data: authUser } = await admin.auth.admin.getUserById(a.id);
      const email = authUser?.user?.email;
      if (!email) continue;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "VIMATCH <onboarding@resend.dev>", to: [email], subject: title, text: body }),
      }).catch(() => {});
    }
  }

  const whatsappPhone = Deno.env.get("ADMIN_WHATSAPP_PHONE");
  const callMeBotKey = Deno.env.get("CALLMEBOT_APIKEY");
  if (whatsappPhone && callMeBotKey) {
    const text = encodeURIComponent(`${title}\n${body}`);
    await fetch(`https://api.callmebot.com/whatsapp.php?phone=${whatsappPhone}&text=${text}&apikey=${callMeBotKey}`).catch(() => {});
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const { kind, description, tripId, reportedUserId } = (await req.json().catch(() => ({}))) as {
    kind?: string;
    description?: string;
    tripId?: string;
    reportedUserId?: string;
  };

  if (!kind || !KINDS.includes(kind as (typeof KINDS)[number])) {
    return json({ error: "kind no válido" }, 400);
  }
  if (!description || description.trim().length < 10) {
    return json({ error: "Describe lo ocurrido con al menos 10 letras" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "no autenticado" }, 401);

  const { error: insertError } = await admin.from("reports").insert({
    reporter_id: user.id,
    reported_user_id: reportedUserId ?? null,
    trip_id: tripId ?? null,
    kind,
    description: description.trim(),
  });
  if (insertError) return json({ error: "No se pudo guardar la denuncia" }, 500);

  const { data: reporterProfile } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const reporterName = reporterProfile?.full_name || "Alguien";

  await notifyAdminsOfReport(admin, reporterName, kind, description.trim()).catch(() => {});

  return json({ ok: true });
});
