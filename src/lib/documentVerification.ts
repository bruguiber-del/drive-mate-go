import { supabase } from "@/integrations/supabase/client";

export type DocumentKind = "driver_license" | "vehicle";
export type DocumentVerdict = "approved" | "rejected" | "needs_review";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

/** Abre el selector de fotos (con cámara en el móvil) y devuelve el archivo elegido.
 *  El <input> se mete en la página (oculto) antes de abrir el selector y se
 *  quita al terminar — suelto, sin meterlo en el DOM, el WebView nativo de
 *  la app a veces no entrega bien el evento de "ya elegiste la foto" (se
 *  queda como si no hubieras hecho nada, sin aviso ni error). */
export function pickPhoto(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.style.position = "fixed";
    input.style.top = "-1000px";
    input.style.opacity = "0";
    document.body.appendChild(input);

    const finish = (file: File | null) => {
      console.log("[pickPhoto] resultado:", file ? `${file.name} ${file.type} ${file.size}b` : "null (sin archivo)");
      input.remove();
      resolve(file);
    };
    input.onchange = () => finish(input.files?.[0] ?? null);
    input.oncancel = () => finish(null);
    console.log("[pickPhoto] abriendo selector...");
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
  console.log("[submitDoc] archivo recibido:", opts.file.name, opts.file.type, opts.file.size + "b");
  if (!ALLOWED_TYPES.includes(opts.file.type)) {
    throw new Error("La foto debe ser JPG, PNG, WEBP o HEIC");
  }
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Inicia sesión para verificar");
  console.log("[submitDoc] usuario:", userId);

  const uploadBlob = await toUploadableJpeg(opts.file).catch((err) => {
    console.log("[submitDoc] toUploadableJpeg falló, se sube el original:", err);
    return opts.file;
  });
  console.log("[submitDoc] blob listo para subir:", uploadBlob.size + "b");
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("verification-docs")
    .upload(path, uploadBlob, { contentType: "image/jpeg", upsert: false });
  if (uploadError) {
    console.log("[submitDoc] fallo al subir al storage:", uploadError.message);
    throw uploadError;
  }
  console.log("[submitDoc] subido al storage en:", path);

  const { data: row, error: insertError } = await supabase
    .from("verification_requests")
    .insert({ user_id: userId, kind: opts.kind, vehicle_id: opts.vehicleId ?? null, storage_path: path })
    .select("id")
    .single();
  if (insertError || !row) {
    console.log("[submitDoc] fallo al crear la solicitud:", insertError?.message);
    throw insertError ?? new Error("No se pudo crear la solicitud");
  }
  console.log("[submitDoc] solicitud creada:", row.id, "— invocando verify-document...");

  const { data, error } = await supabase.functions.invoke("verify-document", { body: { requestId: row.id } });
  if (error) {
    console.log("[submitDoc] fallo de verify-document:", error.message);
    throw error;
  }
  console.log("[submitDoc] respuesta de verify-document:", JSON.stringify(data));
  return data as { status: DocumentVerdict; reason: string };
}
