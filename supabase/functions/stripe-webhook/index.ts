// Escucha eventos de Stripe — de momento solo disputas (contracargos).
// Antes, si alguien impugnaba un cobro desde su banco, nadie en VIMATCH se
// enteraba salvo mirando el panel de Stripe a mano; esto avisa por push a
// quien sea admin (profiles.is_admin) en cuanto Stripe manda el evento.
//
// Hay que registrar esta URL como endpoint de webhook en el Dashboard de
// Stripe (Developers → Webhooks) para el evento "charge.dispute.created",
// y guardar el "Signing secret" que te da como secreto STRIPE_WEBHOOK_SECRET.
//
// Recibe: el payload firmado de Stripe. Devuelve: { received: true }.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const stripeKey = Deno.env.get("STRIPE_TEST_API_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    return json({ error: "Webhook no configurado (falta STRIPE_TEST_API_KEY o STRIPE_WEBHOOK_SECRET)" }, 500);
  }
  const stripe = new Stripe(stripeKey);

  const signature = req.headers.get("stripe-signature") ?? "";
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, webhookSecret);
  } catch (err) {
    // Firma inválida — alguien que no es Stripe intentando llamar aquí, o
    // el secreto guardado no coincide con el del endpoint en el Dashboard.
    return json({ error: `Firma inválida: ${(err as Error).message}` }, 400);
  }

  if (event.type !== "charge.dispute.created") {
    // Solo nos interesa esto por ahora — se acepta cualquier otro evento
    // sin hacer nada, para que Stripe no lo siga reintentando en vano.
    return json({ received: true });
  }

  const dispute = event.data.object as Stripe.Dispute;
  const paymentIntentId =
    typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: tripPassenger } = paymentIntentId
    ? await admin
        .from("trip_passengers")
        .select("id, passenger_name, trip_id")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle()
    : { data: null };

  const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
  const amountEur = (dispute.amount / 100).toFixed(2);
  const title = "⚠️ Disputa de pago en Stripe";
  const body = tripPassenger
    ? `${tripPassenger.passenger_name} impugnó un cobro de ${amountEur}€`
    : `Impugnado un cobro de ${amountEur}€ (sin relacionar con ningún tramo)`;

  for (const a of admins ?? []) {
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", a.id);
    // Reutiliza el mismo envío que send-push-notification, aquí en línea
    // porque esta función corre sin sesión de usuario (la llama Stripe).
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")?.replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")?.replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (!vapidPublicKey || !vapidPrivateKey) continue;
    const webpush = (await import("npm:web-push@3")).default;
    webpush.setVapidDetails("mailto:soporte@vimatch.app", vapidPublicKey, vapidPrivateKey);
    for (const sub of subs ?? []) {
      await webpush
        .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title, body, tag: "dispute" }))
        .catch(() => {});
    }
  }

  return json({ received: true });
});
