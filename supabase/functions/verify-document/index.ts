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

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";
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

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function normalizeText(s: string): string {
  return stripAccents(s).toUpperCase();
}
function normalizePlate(s: string): string {
  return normalizeText(s).replace(/[^A-Z0-9]/g, "");
}

// Sin IA de verdad de por medio (Google Vision es gratis hasta 1.000 fotos
// al mes, pero solo "lee" texto y logos — no entiende la foto): esto compara
// lo leído contra lo que el propio usuario ya declaró al dar de alta su
// carnet o su coche. Más flojo en casos raros que una IA de visión, pero
// gratis y sin depender de ninguna clave de pago.
const LICENSE_KEYWORDS = [
  "PERMISO DE CONDUCCION",
  "DRIVING LICENCE",
  "DRIVING LICENSE",
  "CARNET DE CONDUCIR",
  "PERMIS DE CONDUIRE",
  "FUHRERSCHEIN",
];
const WRONG_DOCUMENT_KEYWORDS = [
  "DOCUMENTO NACIONAL DE IDENTIDAD",
  "PASSPORT",
  "PASAPORTE",
  "TARJETA SANITARIA",
];

function buildLicenseVerdict(fullText: string): Verdict {
  const normalized = normalizeText(fullText);
  if (LICENSE_KEYWORDS.some((k) => normalized.includes(k))) {
    return { matches: true, confidence: 0.9, reason: "Se detectó texto propio de un carnet de conducir.", is_driver_license: true };
  }
  if (WRONG_DOCUMENT_KEYWORDS.some((k) => normalized.includes(k))) {
    return { matches: false, confidence: 0.9, reason: "La foto parece ser de otro documento (DNI, pasaporte...), no un carnet de conducir.", is_driver_license: false };
  }
  if (!normalized.trim()) {
    return { matches: false, confidence: 0.3, reason: "No se detectó texto legible en la foto — hazla más de cerca y con buena luz.", is_driver_license: false };
  }
  return { matches: false, confidence: 0.5, reason: "No se encontraron las palabras típicas de un carnet de conducir — puede ser una foto borrosa o recortada.", is_driver_license: false };
}

// Matrícula española: formato actual (4 dígitos + 3 consonantes, sin
// vocales ni Ñ/Q) y el antiguo (1-2 letras de provincia + 4 dígitos + 1-2
// letras) — cubre lo que va a declarar casi cualquier usuario en España.
function extractPlateCandidates(text: string): string[] {
  const normalized = normalizeText(text).replace(/\n/g, " ");
  const modern = normalized.match(/\b\d{4}\s?[B-DF-HJ-NP-TV-Z]{3}\b/g) ?? [];
  const old = normalized.match(/\b[A-Z]{1,2}\s?\d{4}\s?[A-Z]{1,2}\b/g) ?? [];
  return [...modern, ...old].map((p) => p.replace(/\s+/g, ""));
}

function buildVehicleVerdict(fullText: string, logos: string[], vehicle?: { brand: string; licensePlate: string }): Verdict {
  const candidates = extractPlateCandidates(fullText);
  const declaredPlate = vehicle ? normalizePlate(vehicle.licensePlate) : "";
  const readPlate = candidates[0];

  if (declaredPlate && candidates.some((c) => normalizePlate(c) === declaredPlate)) {
    return { matches: true, confidence: 0.9, reason: "La matrícula leída coincide con la declarada.", plate: readPlate };
  }
  if (readPlate && declaredPlate) {
    return {
      matches: false,
      confidence: 0.9,
      reason: `La matrícula leída (${readPlate}) no coincide con la declarada (${vehicle!.licensePlate}).`,
      plate: readPlate,
    };
  }
  const declaredBrand = vehicle?.brand ? normalizeText(vehicle.brand) : "";
  const logoMatch = declaredBrand && logos.some((l) => {
    const n = normalizeText(l);
    return n.includes(declaredBrand) || declaredBrand.includes(n);
  });
  if (logoMatch) {
    return { matches: true, confidence: 0.7, reason: `Se detectó el logo de ${vehicle!.brand}, pero no se pudo leer bien la matrícula.`, brand: logos[0] };
  }
  return {
    matches: false,
    confidence: 0.3,
    reason: "No se pudo leer ninguna matrícula en la foto, ni se reconoció el logo de la marca — hazla más de cerca y con buena luz.",
  };
}

type VisionAttempt = { verdict: Verdict; failReason?: undefined } | { verdict: null; failReason: string };
type VisionResult = {
  fullTextAnnotation?: { text?: string };
  textAnnotations?: { description?: string }[];
  logoAnnotations?: { description: string }[];
  error?: { message?: string };
};
type VisionCall = { result: VisionResult; failReason?: undefined } | { result?: undefined; failReason: string };

// Google Vision cobra cada función POR SEPARADO, aunque se pidan en la
// misma llamada ("si aplicas detección de caras y de etiquetas a la misma
// imagen, se te facturan las dos" — así lo dice su propia página de
// precios): pedir texto Y logo siempre, para TODAS las fotos, gastaba el
// doble de lo necesario, sobre todo porque el carnet nunca usa el logo.
async function callVision(imageBase64: string, features: { type: string }[]): Promise<VisionCall> {
  const apiKey = Deno.env.get("GOOGLE_VISION_API_KEY");
  if (!apiKey) {
    console.error("[verify-document] falta GOOGLE_VISION_API_KEY");
    return { failReason: "Falta configurar la clave de Google Vision (GOOGLE_VISION_API_KEY)" };
  }
  const res = await fetch(`${VISION_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requests: [{ image: { content: imageBase64 }, features }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[verify-document] Google Vision respondió con error", { status: res.status, body: body.slice(0, 500) });
    return { failReason: `Google Vision no pudo revisar la foto (error ${res.status} del servicio)` };
  }
  const data = await res.json();
  const result = data?.responses?.[0];
  if (result?.error) {
    console.error("[verify-document] Google Vision devolvió un error", result.error);
    return { failReason: result.error.message ?? "Google Vision no pudo revisar la foto" };
  }
  return { result };
}

// Antes, cualquier fallo aquí (clave mal puesta, límite de uso, imagen
// demasiado grande, respuesta que no es JSON válido...) acababa en el mismo
// "no se pudo revisar la foto" tanto en los logs como en lo que veía el
// admin — había que adivinar la causa. Ahora se registra y se devuelve.
async function askGoogleVision(
  imageBase64: string,
  kind: string,
  vehicle?: { brand: string; licensePlate: string },
): Promise<VisionAttempt> {
  const textCall = await callVision(imageBase64, [{ type: "TEXT_DETECTION" }]);
  if (textCall.failReason) return { verdict: null, failReason: textCall.failReason };
  const fullText: string = textCall.result?.fullTextAnnotation?.text ?? textCall.result?.textAnnotations?.[0]?.description ?? "";

  if (kind === "driver_license") {
    return { verdict: buildLicenseVerdict(fullText) };
  }

  // Con la matrícula leída ya basta para decidir (coincide o no coincide):
  // el logo solo hace falta como último recurso cuando no se pudo leer
  // ninguna matrícula, así que esa segunda función solo se pide entonces.
  const declaredPlate = vehicle ? normalizePlate(vehicle.licensePlate) : "";
  const readPlate = extractPlateCandidates(fullText)[0];
  if (readPlate || !declaredPlate) {
    return { verdict: buildVehicleVerdict(fullText, [], vehicle) };
  }

  const logoCall = await callVision(imageBase64, [{ type: "LOGO_DETECTION" }]);
  const logos: string[] = logoCall.result?.logoAnnotations?.map((l: { description: string }) => l.description) ?? [];
  return { verdict: buildVehicleVerdict(fullText, logos, vehicle) };
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

  // Sin desestructurar: TypeScript solo correlaciona "verdict" y "failReason"
  // como viniendo de la misma rama de la unión mientras se compruebe sobre
  // el objeto entero, no sobre variables ya separadas.
  const attempt = await askGoogleVision(imageBase64, request.kind, vehicle);

  let status: "approved" | "rejected" | "needs_review";
  let reason: string;
  if (!attempt.verdict) {
    status = "needs_review";
    reason = attempt.failReason;
  } else if (attempt.verdict.confidence >= MIN_CONFIDENCE && attempt.verdict.matches) {
    status = "approved";
    reason = attempt.verdict.reason;
  } else if (attempt.verdict.confidence >= MIN_CONFIDENCE && !attempt.verdict.matches) {
    status = "rejected";
    reason = attempt.verdict.reason;
  } else {
    status = "needs_review";
    reason = attempt.verdict.reason;
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
