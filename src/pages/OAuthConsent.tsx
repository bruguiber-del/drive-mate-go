import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type OAuthClient = { name?: string; redirect_uri?: string; client_uri?: string };
type AuthorizationDetails = {
  client?: OAuthClient;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};

// The supabase.auth.oauth namespace is beta; keep a tiny local typed wrapper.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};
const oauthApi = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

const OAuthConsent = () => {
  const [params] = useSearchParams();
  const authorizationId = params.get('authorization_id') ?? '';
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError('Falta el parámetro authorization_id');
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = '/auth?next=' + encodeURIComponent(next);
        return;
      }
      setAccount(sess.session.user.email ?? null);
      const { data, error: err } = await oauthApi().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (err) {
        setError(err.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  const decide = async (approve: boolean) => {
    setBusy(true);
    const { data, error: err } = approve
      ? await oauthApi().approveAuthorization(authorizationId)
      : await oauthApi().denyAuthorization(authorizationId);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError('El servidor de autorización no devolvió una URL de redirección.');
      return;
    }
    window.location.href = target;
  };

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-bold text-foreground mb-2">No se pudo cargar la solicitud</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </main>
    );
  }

  const clientName = details.client?.name ?? 'una aplicación';

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md glass-strong rounded-2xl p-6 border border-border">
        <h1 className="text-xl font-bold text-foreground mb-2">
          Conectar {clientName} con VIMATCH
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          Esto permitirá que {clientName} use las herramientas de VIMATCH en tu nombre mientras
          tengas la sesión iniciada.
        </p>

        <div className="space-y-2 text-xs text-muted-foreground mb-6">
          {account && (
            <p>
              Cuenta: <span className="text-foreground font-medium">{account}</span>
            </p>
          )}
          {details.client?.redirect_uri && (
            <p className="break-all">Redirección: {details.client.redirect_uri}</p>
          )}
          {details.scope && <p>Permisos solicitados: {details.scope}</p>}
          <p>Esto no salta los permisos ni las políticas de acceso de la app.</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
            Cancelar conexión
          </Button>
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
            Aprobar
          </Button>
        </div>
      </div>
    </main>
  );
};

export default OAuthConsent;
