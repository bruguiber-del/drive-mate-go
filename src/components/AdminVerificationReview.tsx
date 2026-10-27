import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

interface VerificationRequestItem {
  id: string;
  kind: 'driver_license' | 'vehicle';
  status: string;
  reason: string | null;
  createdAt: string;
  userName: string;
  userPhone: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  licensePlate: string | null;
  photoUrl: string | null;
}

interface AdminVerificationReviewProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Revisión manual de los documentos que la IA no logró aprobar ni rechazar
 * sola (needs_review) — sin esto se quedaban esperando para siempre, sin
 * ninguna forma de resolverlos.
 */
const AdminVerificationReview = ({ isOpen, onClose }: AdminVerificationReviewProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<VerificationRequestItem[]>([]);
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-list-verification-requests', { body: {} });
      if (!error && data?.requests) setRequests(data.requests);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const decide = useCallback(
    async (id: string, decision: 'approved' | 'rejected') => {
      setActingOnId(id);
      try {
        const { data, error } = await supabase.functions.invoke('admin-review-verification', {
          body: { requestId: id, decision },
        });
        if (error || !data?.ok) {
          toast({
            title: 'No se pudo guardar la decisión',
            description: error?.message,
            variant: 'destructive',
            duration: 3000,
          });
          return;
        }
        setRequests((prev) => prev.filter((r) => r.id !== id));
        toast({ title: decision === 'approved' ? 'Aprobado' : 'Rechazado', duration: 1500 });
      } finally {
        setActingOnId(null);
      }
    },
    [toast],
  );

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[85vh] bg-background border-border">
        <div className="overflow-y-auto px-4 pb-6">
          <DrawerHeader className="px-0 pt-2 pb-3">
            <DrawerTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Revisión de documentos
            </DrawerTitle>
          </DrawerHeader>

          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          {!loading && requests.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">No hay nada pendiente de revisar.</p>
          )}

          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="glass rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">
                    {r.kind === 'vehicle' ? 'Vehículo' : 'Carnet de conducir'} — {r.userName}
                  </p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium">
                    {r.status === 'needs_review' ? 'Revisión manual' : 'Pendiente'}
                  </span>
                </div>
                {r.kind === 'vehicle' && (
                  <p className="text-xs text-muted-foreground">
                    Declarado: {r.vehicleBrand} {r.vehicleModel} · matrícula {r.licensePlate}
                  </p>
                )}
                {r.userPhone && <p className="text-xs text-muted-foreground">Tel: {r.userPhone}</p>}
                {r.reason && <p className="text-xs text-muted-foreground italic">IA: "{r.reason}"</p>}
                {r.photoUrl && (
                  <img
                    src={r.photoUrl}
                    alt="Documento a revisar"
                    className="w-full max-h-64 object-contain rounded-lg border border-border bg-muted/30"
                  />
                )}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-destructive border-destructive/40"
                    disabled={actingOnId === r.id}
                    onClick={() => decide(r.id, 'rejected')}
                  >
                    <XCircle className="w-4 h-4 mr-1" /> Rechazar
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={actingOnId === r.id}
                    onClick={() => decide(r.id, 'approved')}
                  >
                    {actingOnId === r.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Aprobar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default AdminVerificationReview;
