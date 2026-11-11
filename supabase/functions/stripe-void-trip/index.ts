// Si el viaje se cancela con una retención ya creada, la cancela en el acto
// — sin esto, el dinero se queda bloqueado en la tarjeta del pasajero hasta
// que Stripe la libera sola a los 7 días.
//
// Recibe: { tripPassengerId }. Devuelve: { voided: true } (o true también
// si no había nada que cancelar — no es un error, solo no hacía falta).

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
  const { tripPassengerId } = (await req.json().catch(() => ({}))) as { tripPassengerId?: string };
  if (!tripPassengerId) return json({ error: "falta tripPassengerId" }, 400);

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
    .select("id, passenger_id, stripe_payment_intent_id, trips!inner(driver_id)")
    .eq("id", tripPassengerId)
    .maybeSingle();

  // El propio pasajero de ESTE tramo puede liberar su retención al
  // cancelar (antes solo se dejaba al conductor, así que un pasajero que
  // cancelaba su parte nunca liberaba nada — la tarjeta se quedaba
  // bloqueada hasta que Stripe la soltaba sola a los 7 días).
  const typedRow = row as unknown as { passenger_id: string | null; trips: { driver_id: string } } | null;
  const isDriver = typedRow?.trips.driver_id === user.id;
  const isOwnPassenger = typedRow?.passenger_id === user.id;
  if (!typedRow || !(isDriver || isOwnPassenger)) {
    return json({ error: "no autorizado para este tramo" }, 403);
  }
  if (!row.stripe_payment_intent_id) return json({ voided: true });

  try {
    await stripe.paymentIntents.cancel(row.stripe_payment_intent_id);
  } catch (err) {
    // Si ya estaba capturado o cancelado, Stripe lo rechaza — no es un
    // fallo real, solo no había nada (más) que liberar.
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("already")) return json({ error: message }, 500);
  }

  return json({ voided: true });
});
