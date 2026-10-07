// Precio medio real de gasolina y diésel entre las gasolineras oficiales
// (Ministerio para la Transición Ecológica) que caen dentro de la ruta —
// el navegador no puede llamar a esa API directamente (no manda cabeceras
// CORS), así que esta función hace de intermediario.
//
// Recibe: { minLat, maxLat, minLng, maxLng } — la caja delimitadora de la
// ruta (con un margen ya añadido en el cliente).
// Devuelve: { gasoline95, dieselA, stationCount, updatedAt }, con los
// precios en €/litro o null si no hay ninguna gasolinera con ese dato en
// la zona.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MITECO_URL =
  "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/";

// Los datos del Ministerio se renuevan cada ~5 min — no tiene sentido pedir
// el fichero completo (~12MB, más de 11.000 gasolineras) más a menudo que
// eso. Se cachea en memoria del propio módulo mientras la instancia siga
// caliente; si se reinicia, simplemente se vuelve a pedir.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedStations: unknown[] | null = null;
let cachedAt = 0;

interface MitecoStation {
  Latitud?: string;
  "Longitud (WGS84)"?: string;
  "Precio Gasolina 95 E5"?: string;
  "Precio Gasoleo A"?: string;
  [key: string]: unknown;
}

function parseSpanishNumber(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

async function fetchOnce(): Promise<MitecoStation[]> {
  const response = await fetch(MITECO_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; Vimatch/1.0)",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    throw new Error(`MITECO respondió ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data?.ListaEESSPrecio) ? data.ListaEESSPrecio : [];
}

// El servidor del Ministerio corta conexiones de vez en cuando
// ("Connection reset by peer") — se reintenta y, si sigue fallando, se usa
// la última copia en caché aunque esté caducada.
async function getAllStations(): Promise<MitecoStation[] | null> {
  const now = Date.now();
  if (cachedStations && now - cachedAt < CACHE_TTL_MS) {
    return cachedStations as MitecoStation[];
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const stations = await fetchOnce();
      cachedStations = stations;
      cachedAt = Date.now();
      return stations;
    } catch (e) {
      console.warn(`MITECO intento ${attempt + 1} falló:`, e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return (cachedStations as MitecoStation[] | null) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { minLat, maxLat, minLng, maxLng } = body ?? {};

    if (
      typeof minLat !== "number" ||
      typeof maxLat !== "number" ||
      typeof minLng !== "number" ||
      typeof maxLng !== "number"
    ) {
      return new Response(
        JSON.stringify({ error: "minLat, maxLat, minLng y maxLng son obligatorios y deben ser números" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const stations = await getAllStations();
    if (!stations) {
      // Fuente no disponible: respuesta válida sin precios, la app usa el
      // coste genérico en vez de romperse.
      return new Response(
        JSON.stringify({ gasoline95: null, dieselA: null, stationCount: 0, updatedAt: null, unavailable: true }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    let gasoline95Sum = 0;
    let gasoline95Count = 0;
    let dieselASum = 0;
    let dieselACount = 0;

    for (const station of stations) {
      const lat = parseSpanishNumber(station.Latitud);
      const lng = parseSpanishNumber(station["Longitud (WGS84)"]);
      if (lat == null || lng == null) continue;
      if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;

      const gasoline95 = parseSpanishNumber(station["Precio Gasolina 95 E5"]);
      if (gasoline95 != null) {
        gasoline95Sum += gasoline95;
        gasoline95Count += 1;
      }

      const dieselA = parseSpanishNumber(station["Precio Gasoleo A"]);
      if (dieselA != null) {
        dieselASum += dieselA;
        dieselACount += 1;
      }
    }

    const result = {
      gasoline95: gasoline95Count > 0 ? Math.round((gasoline95Sum / gasoline95Count) * 1000) / 1000 : null,
      dieselA: dieselACount > 0 ? Math.round((dieselASum / dieselACount) * 1000) / 1000 : null,
      stationCount: Math.max(gasoline95Count, dieselACount),
      updatedAt: new Date().toISOString(),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error desconocido" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
