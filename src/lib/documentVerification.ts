import { supabase } from "@/integrations/supabase/client";

export type DocumentKind = "driver_license" | "vehicle";
export type DocumentVerdict = "approved" | "rejected" | "needs_review";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

/** Abre el selector de fotos (con cámara en el móvil) y devuelve el archivo elegido. */
export function pickPhoto(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

/** Convierte la foto a JPEG y la reduce de tamaño antes de subirla — dos
 *  fallos reales de una sola vez: la API de visión de Claude no admite
 *  HEIC (el formato por defecto de un iPhone al elegir una foto YA
 *  guardada en la galería — solo la cámara en directo da JPEG), así que
 *  esas fotos fallaban siempre y acababan en revisión manual sin motivo
 *  real; y una foto de 10+ MB de una cámara moderna se acerca al límite
 *  de tamaño de la API, aparte de tardar mucho en subir. Ni la matrícula
 *  ni el carnet necesitan más resolución que esta para leerse bien.
 *  Si algo falla aquí (formato raro, sin soporte de canvas…), se sube la
 *  foto original tal cual en vez de bloquear la verificación entera. */
async function toUploadableJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    return blob ?? file;
  } finally {
    bitmap.close();
  }
}

/** Sube la foto a un bucket privado, crea la solicitud y la revisa con IA
 *  (o la deja en revisión manual si la IA no está segura). */
export async function submitDocumentForVerification(opts: {
  kind: DocumentKind;
  file: File;
  vehicleId?: string;
}): Promise<{ status: DocumentVerdict; reason: string }> {
  if (!ALLOWED_TYPES.includes(opts.file.type)) {
    throw new Error("La foto debe ser JPG, PNG, WEBP o HEIC");
  }
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Inicia sesión para verificar");

  const uploadBlob = await toUploadableJpeg(opts.file).catch(() => opts.file);
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("verification-docs")
    .upload(path, uploadBlob, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;

  const { data: row, error: insertError } = await supabase
    .from("verification_requests")
    .insert({ user_id: userId, kind: opts.kind, vehicle_id: opts.vehicleId ?? null, storage_path: path })
    .select("id")
    .single();
  if (insertError || !row) throw insertError ?? new Error("No se pudo crear la solicitud");

  const { data, error } = await supabase.functions.invoke("verify-document", { body: { requestId: row.id } });
  if (error) throw error;
  return data as { status: DocumentVerdict; reason: string };
}
