// Revisa una foto de carnet o de matrícula+logo del coche con IA. Si la IA no
// está segura o los datos no cuadran, la solicitud pasa a revisión manual.
//
// Recibe: { requestId } con el JWT del usuario dueño de la solicitud.
// Actualiza verification_requests.status y, si el vehículo queda aprobado,
// vehicles.verification_status.

import { createClient } from "npm:@supabase/supabase-js@2";

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

// Avisa a quien revisa a mano (profiles.is_admin) cuando la IA deja una
// solicitud en needs_review — sin esto, nadie se enteraba de que había algo
// pendiente salvo entrando a mirar el panel de admin de vez en cuando.
// Manda por los tres canales configurados (los que falten se saltan solos):
// push (ya existente), email (Resend) y WhatsApp (CallMeBot).
async function notifyAdminsNeedsReview(
  admin: ReturnType<typeof createClient>,
  kind: string,
  reason: string,
) {
  const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
  if (!admins?.length) return;

  const label = kind === "driver_license" ? "un carnet de conducir" : "una matrícula/vehículo";
  const title = "📋 Documento para revisar";
  const body = `La IA no pudo verificar ${label}: ${reason}`;

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
            JSON.stringify({ title, body, tag: "verification" }),
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
        body: JSON.stringify({
          from: "VIMATCH <onboarding@resend.dev>",
          to: [email],
          subject: title,
          text: body,
        }),
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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
const MIN_CONFIDENCE = 0.85;

type Verdict = {
  matches: boolean;
  confidence: number;
  reason: string;
  plate?: string;
  brand?: string;
  name?: string;
  is_driver_license?: boolean;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function promptFor(kind: string, vehicle?: { brand: string; licensePlate: string }) {
  if (kind === "driver_license") {
    return `Esta foto debe ser un carnet de conducir. Responde solo con JSON:
{"is_driver_license": boolean, "name": string|null, "confidence": number entre 0 y 1, "matches": boolean, "reason": string}
"matches" es true solo si es claramente un carnet de conducir legible.`;
  }
  return `Esta foto debe mostrar la matrícula de un coche y/o el logo de su marca.
Datos declarados: marca "${vehicle?.brand}", matrícula "${vehicle?.licensePlate}".
Responde solo con JSON:
{"plate": string|null, "brand": string|null, "confidence": number entre 0 y 1, "matches": boolean, "reason": string}
"matches" es true solo si la matrícula leída coincide con la declarada y el logo corresponde a la marca declarada.`;
}

async function askClaude(imageBase64: string, mediaType: string, prompt: string): Promise<Verdict | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return null;
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: prompt },
        ],
      }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Verdict;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const { requestId } = (await req.json().catch(() => ({}))) as { requestId?: string };
  if (!requestId) return json({ error: "requestId requerido" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(url, serviceKey);

  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return json({ error: "no autenticado" }, 401);

  const { data: request } = await admin
    .from("verification_requests")
    .select("id, user_id, kind, vehicle_id, storage_path, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || request.user_id !== userId) return json({ error: "solicitud no encontrada" }, 404);
  if (request.status !== "pending") return json({ status: request.status });

  const { data: file, error: downloadError } = await admin.storage
    .from("verification-docs")
    .download(request.storage_path);
  if (downloadError || !file) return json({ error: "no se pudo leer la foto" }, 500);

  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const imageBase64 = btoa(binary);

  let vehicle: { brand: string; licensePlate: string } | undefined;
  if (request.kind === "vehicle" && request.vehicle_id) {
    const { data: v } = await admin.from("vehicles").select("brand, license_plate").eq("id", request.vehicle_id).maybeSingle();
    if (v) vehicle = { brand: v.brand, licensePlate: v.license_plate };
  }

  const verdict = await askClaude(imageBase64, file.type || "image/jpeg", promptFor(request.kind, vehicle));

  let status: "approved" | "rejected" | "needs_review";
  let reason: string;
  if (!verdict) {
    status = "needs_review";
    reason = "La IA no pudo revisar la foto";
  } else if (verdict.confidence >= MIN_CONFIDENCE && verdict.matches) {
    status = "approved";
    reason = verdict.reason;
  } else if (verdict.confidence >= MIN_CONFIDENCE && !verdict.matches) {
    status = "rejected";
    reason = verdict.reason;
  } else {
    status = "needs_review";
    reason = verdict.reason;
  }

  await admin
    .from("verification_requests")
    .update({ status, reason, reviewed_at: new Date().toISOString() })
    .eq("id", request.id);

  if (status === "approved" && request.kind === "vehicle" && request.vehicle_id) {
    await admin.from("vehicles").update({ verification_status: "verified" }).eq("id", request.vehicle_id);
  }

  if (status === "needs_review") {
    await notifyAdminsNeedsReview(admin, request.kind, reason).catch(() => {});
  }

  return json({ status, reason });
});
