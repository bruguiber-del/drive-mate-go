import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Profile {
  fullName: string | null;
  phone: string | null;
  city: string | null;
  avatarUrl: string | null;
  averageRating: number;
}

interface ProfileRow {
  full_name: string | null;
  phone: string | null;
  city: string | null;
  avatar_url: string | null;
  average_rating: number;
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    fullName: row.full_name,
    phone: row.phone,
    city: row.city,
    avatarUrl: row.avatar_url,
    averageRating: row.average_rating,
  };
}

/**
 * Perfil real del usuario — antes ProfileSection mostraba "Carlos García"
 * y datos fijos sin relación con quien había iniciado sesión. Local-first
 * (funciona sin cuenta), Supabase pasa a ser la fuente de verdad al iniciar
 * sesión, igual que useVehicles.
 */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [phoneConfirmed, setPhoneConfirmed] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [driverTripCount, setDriverTripCount] = useState(0);
  const [passengerTripCount, setPassengerTripCount] = useState(0);
  const userIdRef = useRef<string | null>(null);

  const loadCounts = useCallback(async (userId: string) => {
    const [driverRes, passengerRes] = await Promise.all([
      supabase.from('trips').select('id', { count: 'exact', head: true }).eq('driver_id', userId),
      supabase.from('trips').select('id', { count: 'exact', head: true }).eq('passenger_id', userId),
    ]);
    setDriverTripCount(driverRes.count ?? 0);
    setPassengerTripCount(passengerRes.count ?? 0);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncForUser = async (userId: string | null) => {
      userIdRef.current = userId;
      if (!userId) {
        if (!cancelled) {
          setProfile(null);
          setIsAuthenticated(false);
          setAuthEmail(null);
          setEmailConfirmed(false);
          setPhoneConfirmed(false);
          setDriverTripCount(0);
          setPassengerTripCount(0);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (cancelled) return;

      setIsAuthenticated(true);
      setAuthEmail(user?.email ?? null);
      setEmailConfirmed(!!user?.email_confirmed_at);
      setPhoneConfirmed(!!user?.phone_confirmed_at);

      let { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (cancelled) return;

      // Si por lo que sea el trigger de alta no creó la fila todavía, se crea
      // aquí mismo en vez de dejar el perfil vacío para siempre.
      if (!data) {
        const { data: created } = await supabase
          .from('profiles')
          .insert({ id: userId, full_name: user?.email?.split('@')[0] ?? null, phone: user?.phone ?? null })
          .select('*')
          .maybeSingle();
        data = created;
      }

      if (!cancelled && data) setProfile(rowToProfile(data as ProfileRow));
      await loadCounts(userId);
      if (!cancelled) setLoading(false);
    };

    supabase.auth.getUser().then(({ data }) => syncForUser(data.user?.id ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      syncForUser(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadCounts]);

  const updateProfile = useCallback(
    async (fields: Partial<Pick<Profile, 'fullName' | 'phone' | 'city'>>): Promise<boolean> => {
      const userId = userIdRef.current;
      if (!userId) return false;

      const patch: Record<string, string | null> = {};
      if (fields.fullName !== undefined) patch.full_name = fields.fullName;
      if (fields.phone !== undefined) patch.phone = fields.phone;
      if (fields.city !== undefined) patch.city = fields.city;

      const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
      if (error) return false;

      setProfile((prev) => (prev ? { ...prev, ...fields } : prev));
      return true;
    },
    [],
  );

  return {
    profile,
    authEmail,
    emailConfirmed,
    phoneConfirmed,
    isAuthenticated,
    loading,
    driverTripCount,
    passengerTripCount,
    updateProfile,
  };
}
