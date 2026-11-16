// Nombre, valoración y vehículo del conductor que te ha aceptado — el
// pasajero necesita verlo nada más emparejar, pero las políticas de
// profiles/vehicles (ajustadas por un escaneo de seguridad) ya no dejan
// leer el perfil de otra persona directamente desde el cliente. Antes esto
// se leía con dos llamadas normales desde el navegador (profiles +
// vehicles), que ahora devolverían vacío con ese candado puesto — de ahí
// que el pasajero vería "Conductor" en vez del nombre real.
//
// Recibe: { tripId }. Devuelve: { fullName, averageRating, vehicle }.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const { tripId } = (await req.json().catch(() => ({}))) as { tripId?: string };
  if (!tripId) return json({ error: "falta tripId" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "no autenticado" }, 401);

  const { data: trip } = await admin.from("trips").select("driver_id").eq("id", tripId).maybeSingle();
  if (!trip) return json({ error: "viaje no encontrado" }, 404);

  // Solo el propio conductor, o alguien que de verdad tiene una fila en
  // este viaje (pedida o ya aceptada) — no cualquiera que se sepa un
  // tripId, aunque no sea un dato muy sensible.
  if (trip.driver_id !== user.id) {
    const { data: passengerRow } = await admin
      .from("trip_passengers")
      .select("id")
      .eq("trip_id", tripId)
      .eq("passenger_id", user.id)
      .maybeSingle();
    if (!passengerRow) return json({ error: "no autorizado para este viaje" }, 403);
  }

  // `is_active` puede estar a true en varias filas a la vez (la app elige el
  // vehículo en el cliente, no en la base de datos), así que maybeSingle()
  // fallaba con "contains 2 rows" y el pasajero se quedaba sin vehículo.
  // Se coge el más reciente de los activos: siempre devuelve una fila o ninguna.
  const [{ data: profile }, { data: vehicleRows }] = await Promise.all([
    admin.from("profiles").select("full_name, average_rating").eq("id", trip.driver_id).maybeSingle(),
    admin
      .from("vehicles")
      .select("brand, model, license_plate")
      .eq("user_id", trip.driver_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const vehicle = vehicleRows?.[0] ?? null;

  return json({
    fullName: profile?.full_name ?? null,
    averageRating: profile?.average_rating ?? null,
    vehicle: vehicle
      ? { brand: vehicle.brand, model: vehicle.model, licensePlate: vehicle.license_plate }
      : null,
  });
});
