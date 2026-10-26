// Crea (o reutiliza) la cuenta Express de Stripe Connect del conductor
// autenticado y devuelve un enlace de alta — sin esto, no hay ninguna cuenta
// a la que repartirle su parte de un cobro.
//
// Recibe: { returnUrl } — a dónde vuelve el conductor al terminar (o
// abandonar) el alta en Stripe. Si no se pasa, usa el origin de la petición.
// Devuelve: { url } listo para abrir/redirigir.

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
  const { returnUrl } = (await req.json().catch(() => ({}))) as { returnUrl?: string };

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
    .select("stripe_connect_account_id")
    .eq("id", user.id)
    .maybeSingle();

  let accountId = profile?.stripe_connect_account_id ?? null;

  // Solo se crea una vez — las siguientes veces que el conductor entre a
  // "completar" o "revisar" su alta, se reutiliza la misma cuenta.
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "ES",
      email: user.email ?? undefined,
      capabilities: {
        transfers: { requested: true },
      },
      business_type: "individual",
    });
    accountId = account.id;
    await admin
      .from("profiles")
      .update({ stripe_connect_account_id: accountId })
      .eq("id", user.id);
  }

  const fallbackOrigin = req.headers.get("origin") ?? "https://vimatch.app";
  const base = returnUrl ?? fallbackOrigin;
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: base,
    return_url: base,
    type: "account_onboarding",
  });

  return json({ url: accountLink.url });
});
