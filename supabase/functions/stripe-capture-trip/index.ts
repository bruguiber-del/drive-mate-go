// Al bajarse, captura de la retención SOLO el importe final real de ese
// pasajero (ya recalculado con la ocupación real del tramo) y le transfiere
// al conductor su parte, quedándose VIMATCH con la comisión — todo en el
// mismo movimiento, vía el `transfer_data.destination` fijado al autorizar.
//
// Recibe: { tripPassengerId, amountCents, applicationFeeAmountCents }.
// Devuelve: { captured: true, amountCents }.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

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

  const stripeKey = Deno.env.get("STRIPE_TEST_API_KEY");
  if (!stripeKey) return json({ error: "Stripe no configurado (falta STRIPE_TEST_API_KEY)" }, 500);
  const stripe = new Stripe(stripeKey);

  const authHeader = req.headers.get("Authorization") ?? "";
  const { tripPassengerId, amountCents, applicationFeeAmountCents } = (await req.json().catch(() => ({}))) as {
    tripPassengerId?: string;
    amountCents?: number;
    applicationFeeAmountCents?: number;
  };
  if (!tripPassengerId || !amountCents || amountCents <= 0 || applicationFeeAmountCents == null) {
    return json({ error: "falta tripPassengerId, amountCents o applicationFeeAmountCents" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "no autenticado" }, 401);

  const { data: row } = await admin
    .from("trip_passengers")
    .select("id, stripe_payment_intent_id, trips!inner(driver_id)")
    .eq("id", tripPassengerId)
    .maybeSingle();

  if (!row || (row as unknown as { trips: { driver_id: string } }).trips.driver_id !== user.id) {
    return json({ error: "no autorizado para este tramo" }, 403);
  }
  if (!row.stripe_payment_intent_id) {
    return json({ error: "este tramo no tiene ninguna retención que capturar" }, 400);
  }

  // Nunca se pide más de lo que se retuvo al aceptar — si el importe final
  // (con la ocupación real) acabara siendo mayor por mala suerte, se
  // captura como mucho lo retenido; lo que sobre siempre se libera solo,
  // nunca al revés.
  const heldIntent = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
  const amountToCaptureCents = Math.min(Math.round(amountCents), heldIntent.amount);
  const applicationFeeCents = Math.min(
    Math.round(applicationFeeAmountCents),
    amountToCaptureCents,
  );

  const captured = await stripe.paymentIntents.capture(row.stripe_payment_intent_id, {
    amount_to_capture: amountToCaptureCents,
    application_fee_amount: applicationFeeCents,
  });

  // Deja el precio final de verdad en la fila — antes se quedaba sin
  // actualizar tras el viaje, congelado en la estimación del momento de
  // aceptar al pasajero.
  await admin
    .from("trip_passengers")
    .update({
      price: captured.amount_received / 100,
      status: "completed",
      dropped_off_at: new Date().toISOString(),
    })
    .eq("id", tripPassengerId);

  return json({ captured: true, amountCents: captured.amount_received });
});
