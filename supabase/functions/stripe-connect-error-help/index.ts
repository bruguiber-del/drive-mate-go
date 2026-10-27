// Explica con IA un error de Stripe Connect que el conductor pega desde la
// pantalla de alta: causa probable + pasos concretos para completar el alta.
// Llama al AI Gateway con la clave de servidor (nunca expuesta al cliente).

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const BodySchema = z.object({
  message: z.string().trim().min(5).max(4000),
});

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Consume el stream SSE del gateway y acumula el texto de salida. Streaming
// (no un fetch buffered) evita timeouts en llamadas que tardan.
async function streamExplanation(message: string): Promise<string> {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      "Lovable-API-Key": Deno.env.get("LOVABLE_API_KEY") ?? "",
      "X-Lovable-AIG-SDK": "fetch",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      instructions:
        "Eres un asistente para conductores de una app de viajes compartidos que están " +
        "dando de alta su cuenta de cobros con Stripe Connect. El usuario pega un mensaje " +
        "de error (puede estar en inglés o ser un código técnico). Responde SIEMPRE en " +
        "español, en tono claro y sin tecnicismos. Devuelve JSON con: " +
        "'cause' (1-2 frases con la causa probable) y 'steps' (lista de 2-5 pasos cortos " +
        "y accionables para completar el alta, en orden). Si el mensaje no parece un error " +
        "de Stripe, dilo en 'cause' y sugiere en 'steps' revisar que copió el mensaje completo.",
      input: message,
      text: {
        format: {
          type: "json_schema",
          name: "stripe_error_help",
          strict: true,
          schema: {
            type: "object",
            properties: {
              cause: { type: "string" },
              steps: { type: "array", items: { type: "string" } },
            },
            required: ["cause", "steps"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw Object.assign(new Error(`gateway ${res.status}`), { status: res.status, detail });
  }

  let text = "";
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
          text += evt.delta;
        }
      } catch {
        // línea SSE parcial o evento sin texto: se ignora
      }
    }
  }
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  if (!Deno.env.get("LOVABLE_API_KEY")) {
    return json({ error: "Servicio de IA no configurado." }, 500);
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: "Pega el mensaje de error (entre 5 y 4000 caracteres)." }, 400);
  }

  try {
    const raw = await streamExplanation(parsed.data.message);
    const explanation = JSON.parse(raw);
    return json({ cause: explanation.cause, steps: explanation.steps });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 402 || status === 403) {
      return json({ error: "El servicio de IA no está disponible ahora mismo. Inténtalo más tarde." }, 503);
    }
    if (status === 429 || (status !== undefined && status >= 500)) {
      return json({ error: "El servicio de IA está saturado. Espera unos segundos y reintenta." }, 503);
    }
    return json({ error: "No se pudo analizar el mensaje. Inténtalo de nuevo." }, 500);
  }
});
