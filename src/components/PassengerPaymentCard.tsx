import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { CreditCard, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

let stripePromise: Promise<StripeJs | null> | null = null;
function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string);
  }
  return stripePromise;
}

// El campo de Stripe vive en un iframe aparte, que no hereda las variables
// CSS de esta página — "hsl(var(--foreground))" no se resolvía ahí dentro
// y Stripe caía en su negro por defecto, casi invisible sobre el fondo
// oscuro de la tarjeta. Aquí se lee el valor real ya calculado.
//
// Las variables de este proyecto guardan el triplete sin "hsl(...)"
// alrededor (p. ej. "222 47% 8%"), con espacios en vez de comas — Stripe
// no acepta esa sintaxis moderna de color y lo descartaba en silencio,
// cayendo en su negro por defecto. Montar un elemento de sondeo y leer
// `color` ya resuelto evita tener que adivinar el formato: el navegador
// siempre lo devuelve como "rgb(r, g, b)", que Stripe sí entiende.
function resolveThemeColor(variable: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  if (!raw) return fallback;
  const probe = document.createElement('div');
  probe.style.color = `hsl(${raw})`;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || fallback;
}

const CardForm = ({ onSaved }: { onSaved: () => void }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const textColor = resolveThemeColor('--foreground', '#f8fafc');
  const placeholderColor = resolveThemeColor('--muted-foreground', '#94a3b8');

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!stripe || !elements) return;
      setSaving(true);
      try {
        const { data, error } = await supabase.functions.invoke('stripe-setup-intent', { body: {} });
        if (error || !data?.clientSecret) {
          toast({
            title: 'No se pudo preparar el guardado',
            description: error?.message ?? 'Inténtalo de nuevo en un momento.',
            variant: 'destructive',
            duration: 3000,
          });
          return;
        }
        const cardElement = elements.getElement(CardElement);
        if (!cardElement) return;
        const result = await stripe.confirmCardSetup(data.clientSecret, {
          payment_method: { card: cardElement },
        });
        if (result.error) {
          toast({ title: 'Tarjeta rechazada', description: result.error.message, variant: 'destructive', duration: 3000 });
          return;
        }
        const paymentMethodId = result.setupIntent?.payment_method as string;
        await supabase.functions.invoke('stripe-confirm-payment-method', { body: { paymentMethodId } });
        toast({ title: 'Tarjeta guardada', duration: 1800 });
        onSaved();
      } finally {
        setSaving(false);
      }
    },
    [stripe, elements, toast, onSaved],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="rounded-lg border border-border bg-background px-3 py-2.5">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '14px',
                color: textColor,
                '::placeholder': { color: placeholderColor },
              },
            },
          }}
        />
      </div>
      <Button type="submit" size="sm" className="w-full" disabled={!stripe || saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar tarjeta'}
      </Button>
    </form>
  );
};

/**
 * Tarjeta guardada del usuario como pasajero — sin ella no hay con qué
 * cobrarle ningún tramo. Autocontenida, igual que StripeConnectCard: su
 * propio estado, sin depender del resto de ajustes.
 */
const PassengerPaymentCard = () => {
  const [checking, setChecking] = useState(true);
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [editing, setEditing] = useState(false);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-payment-method-status', { body: {} });
      if (!error && data) setHasPaymentMethod(!!data.hasPaymentMethod);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  return (
    <div className="glass rounded-xl p-3 mb-4">
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            hasPaymentMethod ? 'bg-success/20' : 'bg-muted'
          }`}
        >
          {hasPaymentMethod ? (
            <CheckCircle2 className="w-5 h-5 text-success" />
          ) : (
            <CreditCard className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Tu tarjeta</p>
          <p className="text-[11px] text-muted-foreground">
            {checking ? 'Comprobando...' : hasPaymentMethod ? 'Lista para pagar tus viajes' : 'Añade una tarjeta para poder viajar'}
          </p>
        </div>
        <Button size="sm" variant={hasPaymentMethod ? 'ghost' : 'outline'} disabled={checking} onClick={() => setEditing((v) => !v)}>
          {hasPaymentMethod ? 'Cambiar' : 'Añadir'}
        </Button>
      </div>
      {/* En un portal a document.body, no inline aquí — esta tarjeta se abre
          siempre dentro de un panel animado con Framer Motion (WalletSection,
          PassengerSettingsSheet...), y en Safari de iOS un iframe de
          terceros (el campo de tarjeta de Stripe vive en uno) deja de
          recibir toques en cuanto un antecesor tiene un transform de CSS
          aplicado — como el que deja puesto la animación una vez asentada.
          Sacarlo del árbol del panel evita el bug por completo. */}
      {editing &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
            onClick={() => setEditing(false)}
          >
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
            <div
              className="relative w-full sm:max-w-sm glass-strong rounded-t-3xl sm:rounded-2xl p-4 pb-6 sm:pb-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-foreground">Añadir tarjeta</p>
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <Elements stripe={getStripe()}>
                <CardForm
                  onSaved={() => {
                    setEditing(false);
                    checkStatus();
                  }}
                />
              </Elements>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default PassengerPaymentCard;
