// Da al conductor autenticado un enlace de un solo uso al Dashboard Express
// de Stripe — ahí es donde de verdad puede ver lo que ha cobrado y cuándo
// se lo paga Stripe a su banco. No hay ningún "saldo" guardado en VIMATCH:
// cada cobro se reparte directamente vía Stripe Connect, así que el saldo
// real solo existe en la cuenta de Stripe del conductor, no aquí.
//
// Devuelve: { url } listo para abrir en una pestaña nueva.

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

  const accountId = profile?.stripe_connect_account_id;
  if (!accountId || !profile?.stripe_connect_onboarded) {
    return json({ error: "Todavía no has completado el alta de cobros en Stripe" }, 400);
  }

  const link = await stripe.accounts.createLoginLink(accountId);
  return json({ url: link.url });
});
