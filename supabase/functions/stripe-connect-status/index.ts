// Comprueba en Stripe si la cuenta Connect del conductor autenticado ya
// completó el alta de verdad (identidad + cuenta bancaria) — Stripe te
// devuelve al `return_url` igual hayas terminado o no, así que hace falta
// preguntarle a Stripe, no basta con "ha vuelto de la pantalla de alta".
//
// Devuelve: { connected: boolean, onboarded: boolean }. `connected` = tiene
// cuenta creada; `onboarded` = esa cuenta ya puede recibir pagos de verdad.

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

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ error: "Stripe no configurado (falta STRIPE_SECRET_KEY)" }, 500);
  const stripe = new Stripe(stripeKey);

  const authHeader = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "no autenticado" }, 401);

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_connect_account_id, stripe_connect_onboarded")
    .eq("id", user.id)
    .maybeSingle();

  const accountId = profile?.stripe_connect_account_id ?? null;
  if (!accountId) return json({ connected: false, onboarded: false });

  const account = await stripe.accounts.retrieve(accountId);
  const onboarded = !!account.details_submitted && !!account.payouts_enabled;

  if (onboarded !== profile?.stripe_connect_onboarded) {
    await admin.from("profiles").update({ stripe_connect_onboarded: onboarded }).eq("id", user.id);
  }

  return json({ connected: true, onboarded });
});
