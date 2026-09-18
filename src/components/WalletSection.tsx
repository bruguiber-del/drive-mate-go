import { motion } from 'framer-motion';
import { X, Wallet, CreditCard, ArrowUpRight, ArrowDownLeft, Plus, ChevronRight, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserTrips } from '@/hooks/useUserTrips';

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
  { id: 4, type: 'withdrawal', description: 'Transferencia a banco', amount: -50.00, date: '10 Dic' },
];

const WalletSection = ({ isOpen, onClose }: WalletSectionProps) => {
  const { trips, isAuthenticated } = useUserTrips(isOpen);

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

  const balance = isAuthenticated
    ? transactions.reduce((sum, tx) => sum + tx.amount, 0)
    : 67.42;

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
            <h2 className="text-xl font-bold text-foreground">Pagos y Cartera</h2>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="p-6 space-y-6">
            {/* Balance Card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-secondary p-6">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
              
              <div className="relative">
                <div className="flex items-center gap-2 text-primary-foreground/80">
                  <Wallet className="w-5 h-5" />
                  <span className="text-sm font-medium">Saldo disponible</span>
                </div>
                <p className="text-4xl font-bold text-primary-foreground mt-2">€67.42</p>
                
                <div className="flex gap-3 mt-6">
                  <Button variant="secondary" size="sm" className="flex-1">
                    <ArrowUpRight className="w-4 h-4 mr-2" />
                    Retirar
                  </Button>
                  <Button variant="secondary" size="sm" className="flex-1">
                    <Plus className="w-4 h-4 mr-2" />
                    Añadir fondos
                  </Button>
                </div>
              </div>
            </div>

            {/* Pending Notice */}
            <div className="glass rounded-xl p-4 flex items-center gap-3 border border-warning/30">
              <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-warning" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">Pagos retenidos</p>
                <p className="text-sm text-muted-foreground">€12.50 pendientes de viajes activos</p>
              </div>
            </div>

            {/* Payment Methods */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-foreground">Métodos de pago</h4>
                <Button variant="ghost" size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Añadir
                </Button>
              </div>
              
              <button className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-foreground">•••• •••• •••• 4532</p>
                  <p className="text-sm text-muted-foreground">Visa · Expira 12/26</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Recent Transactions */}
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">Movimientos recientes</h4>
              
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
                Vimatch cobra un <span className="text-primary font-bold">15%</span> de comisión por viaje.
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
