import { useEffect, useState } from 'react';
import { CreditCard, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

/**
 * Alta y estado de la cuenta de Stripe Connect del conductor — sin ella no
 * hay dónde transferirle su parte de ningún cobro. Autocontenido: gestiona
 * su propio estado de carga, no depende de nada del resto de ajustes.
 */
const StripeConnectCard = () => {
  const { toast } = useToast();
  const [checking, setChecking] = useState(true);
  const [onboarded, setOnboarded] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<{ cause: string; steps: string[] } | null>(null);

  const handleExplain = async () => {
    if (errorText.trim().length < 5) return;
    setExplaining(true);
    setExplanation(null);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect-error-help', {
        body: { message: errorText.trim() },
      });
      if (error || !data?.cause) {
        toast({
          title: 'No se pudo analizar',
          description: data?.error ?? 'Inténtalo de nuevo en un momento.',
          variant: 'destructive',
          duration: 3000,
        });
        return;
      }
      setExplanation({ cause: data.cause, steps: data.steps ?? [] });
    } finally {
      setExplaining(false);
    }
  };

  const checkStatus = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect-status', { body: {} });
      if (!error && data) setOnboarded(!!data.onboarded);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkStatus();
    // Si vuelves de completar el alta en Stripe (pestaña aparte) y recuperas
    // el foco en esta, se vuelve a comprobar solo — si no, "Conectar" se
    // quedaría ahí aunque ya hubieras terminado hasta recargar la app entera.
    const onFocus = () => checkStatus();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect-onboarding', {
        body: { returnUrl: window.location.href },
      });
      if (error || !data?.url) {
        toast({
          title: 'No se pudo abrir Stripe',
          description: error?.message ?? 'Inténtalo de nuevo en un momento.',
          variant: 'destructive',
          duration: 3000,
        });
        return;
      }
      window.open(data.url, '_blank');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="glass rounded-xl p-3 mb-4">
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            onboarded ? 'bg-success/20' : 'bg-muted'
          }`}
        >
          {onboarded ? (
            <CheckCircle2 className="w-5 h-5 text-success" />
          ) : (
            <CreditCard className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Cobros (Stripe)</p>
          <p className="text-[11px] text-muted-foreground">
            {checking
              ? 'Comprobando...'
              : onboarded
                ? 'Cuenta lista para recibir pagos'
                : 'Completa el alta para poder cobrar de verdad'}
          </p>
        </div>
        <Button size="sm" variant={onboarded ? 'ghost' : 'outline'} onClick={handleConnect} disabled={connecting || checking}>
          {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : onboarded ? 'Revisar' : 'Conectar'}
        </Button>
      </div>
      <button
        type="button"
        onClick={() => setShowHelp((v) => !v)}
        className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Sparkles className="w-3 h-3" />
        {showHelp ? 'Ocultar ayuda con errores' : '¿Te da error el alta? Pégalo aquí'}
      </button>
      {showHelp && (
        <div className="mt-2 space-y-2">
          <textarea
            value={errorText}
            onChange={(e) => setErrorText(e.target.value)}
            placeholder="Pega aquí el mensaje de error que te muestra Stripe..."
            rows={3}
            className="w-full rounded-lg bg-muted/50 border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleExplain}
            disabled={explaining || errorText.trim().length < 5}
            className="w-full"
          >
            {explaining ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Analizando...
              </>
            ) : (
              'Explicar el error'
            )}
          </Button>
          {explanation && (
            <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-2">
              <p className="text-xs text-foreground">{explanation.cause}</p>
              {explanation.steps.length > 0 && (
                <ol className="list-decimal list-inside space-y-1">
                  {explanation.steps.map((step, i) => (
                    <li key={i} className="text-[11px] text-muted-foreground">
                      {step}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StripeConnectCard;
