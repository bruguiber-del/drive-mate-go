// Mensaje a soporte — desde el formulario de Ayuda, o automático cuando el
// ErrorBoundary pilla un fallo de verdad. Antes los botones de "Chat" /
// "Llamar" / "Email" en Ayuda no hacían nada, y un fallo real no tenía
// forma de avisar a nadie salvo que la persona afectada lo contara ella
// misma. No exige sesión — un fallo puede pasar antes de iniciar sesión.
//
// Recibe: { message, context? }. Devuelve: { ok: true }.

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

function base64Url(value: string | undefined) {
  if (!value) return undefined;
  const clean = value.replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return clean || undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const { message, context } = (await req.json().catch(() => ({}))) as {
    message?: string;
    context?: string;
  };
  if (!message || message.trim().length < 5) {
    return json({ error: "Escribe un mensaje un poco más largo" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Opcional: si llega con sesión (el caso normal), se guarda de quién es;
  // si no (un fallo justo al abrir la app, antes de loguearse), igualmente
  // se manda — perder el aviso sería peor que no saber quién lo mandó.
  const authHeader = req.headers.get("Authorization") ?? "";
  let userId: string | null = null;
  let userLabel = "Alguien sin identificar";
  if (authHeader) {
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (userData?.user) {
      userId = userData.user.id;
      const { data: profile } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
      userLabel = profile?.full_name || userData.user.email || userId;
    }
  }

  // Límite de frecuencia solo para quien tiene sesión — a alguien anónimo
  // no se le puede identificar para limitarlo, pero tampoco puede señalar
  // a nadie con esto, así que el riesgo es mucho menor.
  if (userId) {
    const { data: recent } = await admin
      .from("support_messages")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent && Date.now() - new Date(recent.created_at).getTime() < 2 * 60 * 1000) {
      return json({ error: "Espera un par de minutos antes de mandar otro mensaje" }, 429);
    }
  }

  await admin.from("support_messages").insert({ user_id: userId, message: message.trim(), context: context ?? null });

  const title = "📩 Mensaje de soporte en VIMATCH";
  const body = `${userLabel}: ${message.trim().slice(0, 200)}${context ? `\n(${context.slice(0, 200)})` : ""}`;

  const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
  const vapidPublicKey = base64Url(Deno.env.get("VAPID_PUBLIC_KEY"));
  const vapidPrivateKey = base64Url(Deno.env.get("VAPID_PRIVATE_KEY"));
  if (vapidPublicKey && vapidPrivateKey && admins?.length) {
    const webpush = (await import("npm:web-push@3")).default;
    webpush.setVapidDetails("mailto:soporte@vimatch.app", vapidPublicKey, vapidPrivateKey);
    for (const a of admins) {
      const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", a.id);
      for (const sub of subs ?? []) {
        await webpush
          .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title, body, tag: "support" }))
          .catch(() => {});
      }
    }
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (resendApiKey && admins?.length) {
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

  return json({ ok: true });
});
