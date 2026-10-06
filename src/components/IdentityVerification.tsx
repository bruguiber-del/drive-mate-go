import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { pickPhoto, submitDocumentForVerification } from "@/lib/documentVerification";

const E164 = /^\+[1-9]\d{7,14}$/;

const STATUS_TEXT: Record<string, string> = {
  pending: "Pendiente de revisión",
  approved: "Carnet verificado",
  rejected: "Rechazado: haz una foto más clara",
  needs_review: "En revisión manual",
};

/** Verificación del teléfono (SMS) y del carnet de conducir (foto + IA). */
const IdentityVerification = ({ phoneConfirmed }: { phoneConfirmed: boolean }) => {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<{ status: string; reason: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("verification_requests")
        .select("status, reason")
        .eq("kind", "driver_license")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) setLicenseStatus(data);
    })();
    return () => { cancelled = true; };
  }, []);

  const sendCode = async () => {
    if (!E164.test(phone)) {
      toast({ title: "Número no válido", description: "Usa el formato internacional, p. ej. +34600111222", duration: 3000 });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ phone });
    setBusy(false);
    if (error) {
      toast({ title: "No se pudo enviar el código", description: error.message, duration: 4000 });
      return;
    }
    setCodeSent(true);
  };

  const verifyCode = async () => {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: "phone_change" });
    setBusy(false);
    if (error) {
      toast({ title: "Código incorrecto", description: error.message, duration: 3000 });
      return;
    }
    toast({ title: "Teléfono verificado", duration: 2500 });
  };

  const uploadLicense = async () => {
    const photo = await pickPhoto();
    if (!photo) return;
    setBusy(true);
    try {
      const result = await submitDocumentForVerification({ kind: "driver_license", file: photo });
      setLicenseStatus({ status: result.status, reason: result.reason });
    } catch (err) {
      toast({ title: "No se pudo subir la foto", description: err instanceof Error ? err.message : "Inténtalo de nuevo", duration: 4000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {!phoneConfirmed && (
        <div className="glass rounded-xl p-4 space-y-3">
          <p className="font-medium text-foreground">Verificar teléfono</p>
          {!codeSent ? (
            <>
              <Input placeholder="+34600111222" value={phone} onChange={(e) => setPhone(e.target.value.trim())} />
              <Button size="sm" className="w-full" disabled={busy} onClick={sendCode}>Enviar código por SMS</Button>
            </>
          ) : (
            <>
              <Input placeholder="Código de 6 dígitos" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.trim())} />
              <Button size="sm" className="w-full" disabled={busy} onClick={verifyCode}>Verificar código</Button>
            </>
          )}
        </div>
      )}

      <div className="glass rounded-xl p-4 space-y-2">
        <p className="font-medium text-foreground">Carnet de conducir</p>
        <p className="text-xs text-muted-foreground">
          Haz una foto legible del carnet. Se revisa con IA y, si no está clara, pasa a revisión manual.
        </p>
        {licenseStatus && (
          <p className="text-sm text-foreground">
            {STATUS_TEXT[licenseStatus.status] ?? licenseStatus.status}
            {licenseStatus.reason ? <span className="block text-xs text-muted-foreground">{licenseStatus.reason}</span> : null}
          </p>
        )}
        <Button size="sm" variant="outline" className="w-full" disabled={busy || licenseStatus?.status === "approved"} onClick={uploadLicense}>
          Subir foto del carnet
        </Button>
      </div>
    </div>
  );
};

export default IdentityVerification;
