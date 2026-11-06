import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, ShieldAlert, UserX, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

interface ReportItem {
  id: string;
  kind: string;
  description: string;
  status: string;
  createdAt: string;
  reporterName: string;
  reportedName: string | null;
  reportedUserId: string | null;
  reportedSuspended: boolean;
}

interface SuspendedItem {
  id: string;
  fullName: string;
  averageRating: number;
  suspendedAt: string;
  suspensionReason: string | null;
}

const KIND_LABEL: Record<string, string> = {
  accidente: 'Accidente',
  conductor: 'Conductor',
  pasajero: 'Pasajero',
  otro: 'Otro',
};

interface AdminReportsReviewProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Revisión de las denuncias del botón SOS, más la lista de cuentas
 * suspendidas (a mano o en automático por valoración baja) — sin esto, ni
 * las denuncias ni las suspensiones automáticas tenían dónde verse ni
 * cómo resolverse.
 */
const AdminReportsReview = ({ isOpen, onClose }: AdminReportsReviewProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [suspended, setSuspended] = useState<SuspendedItem[]>([]);
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reportsRes, suspendedRes] = await Promise.all([
        supabase.functions.invoke('admin-list-reports', { body: {} }),
        supabase.functions.invoke('admin-list-suspended', { body: {} }),
      ]);
      if (reportsRes.data?.reports) setReports(reportsRes.data.reports);
      if (suspendedRes.data?.profiles) setSuspended(suspendedRes.data.profiles);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const resolveReport = useCallback(
    async (report: ReportItem, decision: 'reviewed' | 'dismissed', suspendUser = false) => {
      setActingOnId(report.id);
      try {
        const { data, error } = await supabase.functions.invoke('admin-resolve-report', {
          body: { reportId: report.id, status: decision, suspendUser },
        });
        if (error || !data?.ok) {
          toast({ title: 'No se pudo guardar', description: error?.message, variant: 'destructive', duration: 3000 });
          return;
        }
        toast({ title: suspendUser ? `${report.reportedName} suspendido/a` : 'Denuncia resuelta', duration: 1800 });
        load();
      } finally {
        setActingOnId(null);
      }
    },
    [toast, load],
  );

  const reactivate = useCallback(
    async (profileId: string) => {
      setActingOnId(profileId);
      try {
        const { data, error } = await supabase.functions.invoke('admin-set-suspension', {
          body: { userId: profileId, suspended: false },
        });
        if (error || !data?.ok) {
          toast({ title: 'No se pudo reactivar', description: error?.message, variant: 'destructive', duration: 3000 });
          return;
        }
        toast({ title: 'Cuenta reactivada', duration: 1800 });
        load();
      } finally {
        setActingOnId(null);
      }
    },
    [toast, load],
  );

  const pendingReports = reports.filter((r) => r.status === 'pending');

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[85vh] bg-background border-border">
        <div className="overflow-y-auto px-4 pb-6">
          <DrawerHeader className="px-0 pt-2 pb-3">
            <DrawerTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              Denuncias y suspensiones
            </DrawerTitle>
          </DrawerHeader>

          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          {!loading && (
            <>
              <h4 className="text-sm font-semibold text-foreground mb-2">
                Denuncias pendientes {pendingReports.length > 0 && `(${pendingReports.length})`}
              </h4>
              {pendingReports.length === 0 && (
                <p className="text-xs text-muted-foreground pb-4">No hay denuncias pendientes.</p>
              )}
              <div className="space-y-3 mb-6">
                {pendingReports.map((r) => (
                  <div key={r.id} className="glass rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">
                        {KIND_LABEL[r.kind] ?? r.kind} · de {r.reporterName}
                      </p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-medium">
                        Pendiente
                      </span>
                    </div>
                    {r.reportedName && (
                      <p className="text-xs text-muted-foreground">
                        Sobre: {r.reportedName} {r.reportedSuspended && '(ya suspendido/a)'}
                      </p>
                    )}
                    <p className="text-xs text-foreground italic">"{r.description}"</p>
                    <div className="flex gap-2 pt-1 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actingOnId === r.id}
                        onClick={() => resolveReport(r, 'dismissed')}
                      >
                        <XCircle className="w-4 h-4 mr-1" /> Descartar
                      </Button>
                      {r.reportedUserId && !r.reportedSuspended && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/40"
                          disabled={actingOnId === r.id}
                          onClick={() => resolveReport(r, 'reviewed', true)}
                        >
                          <UserX className="w-4 h-4 mr-1" /> Suspender
                        </Button>
                      )}
                      <Button size="sm" disabled={actingOnId === r.id} onClick={() => resolveReport(r, 'reviewed')}>
                        {actingOnId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                          <>
                            <CheckCircle2 className="w-4 h-4 mr-1" /> Marcar revisada
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <h4 className="text-sm font-semibold text-foreground mb-2">
                Cuentas suspendidas {suspended.length > 0 && `(${suspended.length})`}
              </h4>
              {suspended.length === 0 && (
                <p className="text-xs text-muted-foreground">No hay ninguna cuenta suspendida ahora mismo.</p>
              )}
              <div className="space-y-3">
                {suspended.map((p) => (
                  <div key={p.id} className="glass rounded-xl p-3 space-y-1.5">
                    <p className="text-sm font-semibold text-foreground">
                      {p.fullName} · {p.averageRating}★
                    </p>
                    {p.suspensionReason && <p className="text-xs text-muted-foreground">{p.suspensionReason}</p>}
                    <Button size="sm" disabled={actingOnId === p.id} onClick={() => reactivate(p.id)}>
                      {actingOnId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                        <>
                          <UserCheck className="w-4 h-4 mr-1" /> Reactivar
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default AdminReportsReview;
