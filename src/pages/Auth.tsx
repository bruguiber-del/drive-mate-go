import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

/** Only same-origin relative paths are accepted as post-login targets. */
function safeNext(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

const Auth = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) window.location.replace(next);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(next);
    });
    return () => sub.subscription.unsubscribe();
  }, [next]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${next}` },
        });
        if (error) throw error;
        toast.success('Revisa tu correo para confirmar la cuenta');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.replace(next);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de autenticación');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: `${window.location.origin}/auth?next=${encodeURIComponent(next)}`,
      });
      if (result.error) {
        toast.error('No se pudo iniciar sesión con Google');
        return;
      }
      if (result.redirected) return;
      window.location.replace(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm glass-strong rounded-2xl p-6 border border-border">
        <h1 className="text-2xl font-extrabold mb-1">
          <span className="text-gradient">VI</span>
          <span className="text-foreground">MATCH</span>
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {mode === 'signin' ? 'Inicia sesión para continuar' : 'Crea tu cuenta'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === 'signin' ? 'Entrar' : 'Registrarme'}
          </Button>
        </form>

        <Button variant="outline" className="w-full mt-3" onClick={handleGoogle} disabled={busy}>
          Continuar con Google
        </Button>

        <button
          type="button"
          className="w-full mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        >
          {mode === 'signin' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
        </button>

        <button
          type="button"
          className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => navigate('/')}
        >
          Continuar sin cuenta
        </button>
      </div>
    </main>
  );
};

export default Auth;
