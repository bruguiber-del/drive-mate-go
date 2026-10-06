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

  const ext = opts.file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("verification-docs")
    .upload(path, opts.file, { contentType: opts.file.type, upsert: false });
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
