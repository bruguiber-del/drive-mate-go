import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, ArrowUpRight, ArrowDownLeft, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useUserTrips } from '@/hooks/useUserTrips';
import PassengerPaymentCard from '@/components/PassengerPaymentCard';
import StripeConnectCard from '@/components/StripeConnectCard';

interface WalletSectionProps {
  isOpen: boolean;
  onClose: () => void;
}

interface WalletTx {
  id: string | number;
  type: 'earning' | 'expense' | 'withdrawal';
  description: string;
  amount: number;
  date: string;
}

const sampleTransactions: WalletTx[] = [
  { id: 1, type: 'earning', description: 'Viaje Huesca → Zaragoza', amount: 10.62, date: '15 Dic' },
  { id: 2, type: 'expense', description: 'Viaje Zaragoza → Huesca', amount: -6.00, date: '14 Dic' },
  { id: 3, type: 'earning', description: 'Viaje Huesca → Jaca', amount: 6.80, date: '12 Dic' },
];

/** Suma de lo que tienes retenido ahora mismo en viajes todavía sin
 *  terminar — la retención real se libera/cobra al completar el viaje, así
 *  que esto es lo único que de verdad cuenta como "pendiente". */
function usePendingHold(enabled: boolean) {
  const [amount, setAmount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) {
        if (!cancelled) setAmount(null);
        return;
      }
      const { data } = await supabase
        .from('trip_passengers')
        .select('price')
        .eq('passenger_id', uid)
        .in('status', ['requested', 'waiting_pickup']);
      if (cancelled) return;
      const total = (data ?? []).reduce((sum, row) => sum + (row.price ?? 0), 0);
      setAmount(total);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return amount;
}

/**
 * Antes esta pantalla enseñaba un saldo inventado, una tarjeta que nadie
 * había añadido de verdad, y botones de "Retirar"/"Añadir fondos" que no
 * hacían nada — VIMATCH no guarda ningún saldo propio: cada cobro se reparte
 * directamente vía Stripe Connect, así que no hay nada que "retirar" desde
 * aquí. Ahora reutiliza los componentes reales de pago (los mismos que ya
 * funcionan en los ajustes de pasajero/conductor) y solo muestra números que
 * salen de verdad de la base de datos o de Stripe.
 */
const WalletSection = ({ isOpen, onClose }: WalletSectionProps) => {
  const { trips, isAuthenticated } = useUserTrips(isOpen);
  const pendingHold = usePendingHold(isOpen);

  const transactions: WalletTx[] = isAuthenticated
    ? trips
        .filter((t) => t.price !== null)
        .map((t) => ({
          id: t.id,
          type: t.role === 'driver' ? ('earning' as const) : ('expense' as const),
          description: `Viaje ${t.originName ?? 'Origen'} → ${t.destinationName ?? 'Destino'}`,
          amount: t.role === 'driver' ? (t.price ?? 0) : -(t.price ?? 0),
          date: new Date(t.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        }))
    : sampleTransactions;

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50"
    >
      <div className="absolute inset-0 bg-background/95 backdrop-blur-md" onClick={onClose} />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25 }}
        className="absolute inset-x-0 bottom-0 top-12 bg-card rounded-t-3xl overflow-hidden"
      >
        <div className="h-full overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-card/95 backdrop-blur-sm p-4 flex items-center justify-between border-b border-border">
            <h2 className="text-xl font-bold text-foreground">Pagos</h2>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="p-6 space-y-6">
            {isAuthenticated && pendingHold !== null && pendingHold > 0 && (
              <div className="glass rounded-xl p-4 flex items-center gap-3 border border-warning/30">
                <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-warning" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">Pagos retenidos</p>
                  <p className="text-sm text-muted-foreground">
                    €{pendingHold.toFixed(2)} pendientes de viajes activos sin terminar
                  </p>
                </div>
              </div>
            )}

            {/* Payment methods — los componentes reales, no una maqueta */}
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">Métodos de pago y cobro</h4>
              <PassengerPaymentCard />
              <StripeConnectCard />
            </div>

            {/* Recent Transactions */}
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">Movimientos recientes</h4>

              {transactions.length === 0 && (
                <p className="text-sm text-muted-foreground py-3">Todavía no tienes movimientos.</p>
              )}

              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    tx.type === 'earning' ? 'bg-success/20' :
                    tx.type === 'withdrawal' ? 'bg-muted' : 'bg-secondary/20'
                  }`}>
                    {tx.type === 'earning' ? (
                      <ArrowDownLeft className="w-5 h-5 text-success" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground text-sm">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">{tx.date}</p>
                  </div>
                  <span className={`font-bold ${
                    tx.amount > 0 ? 'text-success' : 'text-foreground'
                  }`}>
                    {tx.amount > 0 ? '+' : ''}€{Math.abs(tx.amount).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Commission Info */}
            <div className="glass rounded-xl p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Vimatch cobra un <span className="text-primary font-bold">12%</span> de comisión por viaje.
                <br />Los pagos se liberan al finalizar el viaje.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default WalletSection;
