import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  type RoadAlertKind,
  ROAD_ALERT_DEFAULT_DURATION_S,
  ROAD_ALERT_CONFIRM_EXTEND_S,
} from '@/lib/roadAlerts';

export interface RoadAlert {
  id: string;
  kind: RoadAlertKind;
  lat: number;
  lng: number;
  createdAt: string;
  expiresAt: string;
  confirmations: number;
  /** Para no dejar confirmar/descartar el propio aviso que acabas de poner. */
  isMine: boolean;
}

const POLL_MS = 30000;

/**
 * Avisos de carretera estilo Waze — radar, policía, accidente, obstáculo,
 * obras, atasco. Antes no existía nada de esto; solo la ruta y el tráfico
 * que ya da Mapbox. Se refrescan por sondeo cada 30s (poco volumen
 * esperado, no hace falta tiempo real de verdad para esto).
 */
export function useRoadAlerts(enabled: boolean) {
  const [alerts, setAlerts] = useState<RoadAlert[]>([]);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const myId = userData?.user?.id;
    const { data } = await supabase
      .from('road_alerts')
      .select('id, creator_id, kind, lat, lng, created_at, expires_at, confirmations')
      .gt('expires_at', new Date().toISOString());
    if (!data) return;
    setAlerts(
      data.map((r) => ({
        id: r.id,
        kind: r.kind as RoadAlertKind,
        lat: r.lat,
        lng: r.lng,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        confirmations: r.confirmations,
        isMine: r.creator_id === myId,
      })),
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, load]);

  const reportAlert = useCallback(
    async (kind: RoadAlertKind, lat: number, lng: number): Promise<boolean> => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return false;
      const expiresAt = new Date(Date.now() + ROAD_ALERT_DEFAULT_DURATION_S[kind] * 1000).toISOString();
      const { error } = await supabase
        .from('road_alerts')
        .insert({ creator_id: userId, kind, lat, lng, expires_at: expiresAt });
      if (!error) await load();
      return !error;
    },
    [load],
  );

  const confirmAlert = useCallback(
    async (alert: RoadAlert, stillThere: boolean) => {
      await supabase.rpc('confirm_road_alert', {
        p_alert_id: alert.id,
        p_still_there: stillThere,
        p_extend_seconds: ROAD_ALERT_CONFIRM_EXTEND_S[alert.kind],
      });
      await load();
    },
    [load],
  );

  return { alerts, reportAlert, confirmAlert };
}
