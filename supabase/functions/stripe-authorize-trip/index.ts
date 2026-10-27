// Al aceptar a un pasajero, retiene (sin cobrar todavía) el máximo que
// podría llegar a costarle ese tramo — el importe final real se sabrá solo
// al bajarse (depende de cuánta gente más suba/baje mientras tanto), así que
// aquí solo se autoriza, nunca se captura.
//
// Recibe: { tripPassengerId, holdAmountCents }. Devuelve: { paymentIntentId, status }.
//
// NOTA (fase de autocobro de prueba, modo prueba): el pasajero de este
// tramo es simulado — es el propio conductor autenticado quien hace de las
// dos partes para poder probar el ciclo de dinero real de extremo a
// extremo. Por eso el Customer (quien paga) y la cuenta Connect (quien
// cobra) se leen del MISMO perfil. Cuando exista el modo pasajero real,
// aquí se leerá el customer del pasajero real y la cuenta Connect del
// conductor real, cada uno de su propio perfil.

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
  const { tripPassengerId, holdAmountCents } = (await req.json().catch(() => ({}))) as {
    tripPassengerId?: string;
    holdAmountCents?: number;
  };
  if (!tripPassengerId || !holdAmountCents || holdAmountCents <= 0) {
    return json({ error: "falta tripPassengerId o holdAmountCents" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "no autenticado" }, 401);

  // El conductor de ese tramo tiene que ser quien está llamando — evita que
  // cualquiera retenga dinero en nombre de un trip_passengers ajeno.
  const { data: row } = await admin
    .from("trip_passengers")
    .select("id, stripe_payment_intent_id, trips!inner(driver_id)")
    .eq("id", tripPassengerId)
    .maybeSingle();

  if (!row || (row as unknown as { trips: { driver_id: string } }).trips.driver_id !== user.id) {
    return json({ error: "no autorizado para este tramo" }, 403);
  }
  if (row.stripe_payment_intent_id) {
    return json({ error: "este tramo ya tiene una retención creada" }, 409);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, stripe_connect_account_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    return json({ error: "falta guardar una tarjeta (modo pasajero) antes de poder retener nada" }, 400);
  }
  if (!profile?.stripe_connect_account_id) {
    return json({ error: "falta completar el alta de Stripe Connect (modo conductor)" }, 400);
  }

  const customer = await stripe.customers.retrieve(profile.stripe_customer_id);
  const defaultPaymentMethod = !customer.deleted
    ? (customer.invoice_settings?.default_payment_method as string | null)
    : null;
  if (!defaultPaymentMethod) {
    return json({ error: "no hay ninguna tarjeta guardada como predeterminada" }, 400);
  }

  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(holdAmountCents),
      currency: "eur",
      customer: profile.stripe_customer_id,
      payment_method: defaultPaymentMethod,
      off_session: true,
      confirm: true,
      capture_method: "manual",
      transfer_data: { destination: profile.stripe_connect_account_id },
    });
  } catch (err) {
    // Sin este try/catch, un error de Stripe aquí (p.ej. la tarjeta pide
    // verificación 3D Secure, algo que un cobro en segundo plano sin el
    // pasajero delante no puede completar) tiraba la función entera sin
    // CORS en la respuesta — el cliente solo veía "Failed to send a
    // request", sin ninguna pista de qué pasó de verdad.
    const stripeErr = err as { code?: string; message?: string };
    const message =
      stripeErr.code === "authentication_required"
        ? "La tarjeta guardada pide verificación adicional (3D Secure) — en modo prueba, usa el número 4242 4242 4242 4242, que no la pide."
        : (stripeErr.message ?? "No se pudo retener el pago.");
    return json({ error: message }, 402);
  }

  await admin
    .from("trip_passengers")
    .update({ stripe_payment_intent_id: paymentIntent.id })
    .eq("id", tripPassengerId);

  return json({ paymentIntentId: paymentIntent.id, status: paymentIntent.status });
});
