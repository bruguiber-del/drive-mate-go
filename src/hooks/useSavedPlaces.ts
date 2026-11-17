import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type SavedPlaceKind = 'home' | 'work' | 'other';

export interface SavedPlace {
  id: string;
  kind: SavedPlaceKind;
  /** Solo relevante cuando kind==='other' — qué icono mostrar. */
  icon: string | null;
  label: string;
  name: string;
  lat: number;
  lng: number;
}

export interface NewSavedPlace {
  kind: SavedPlaceKind;
  icon?: string | null;
  label: string;
  name: string;
  lat: number;
  lng: number;
}

function rowToPlace(row: any): SavedPlace {
  return {
    id: row.id,
    kind: row.kind,
    icon: row.icon,
    label: row.label,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
  };
}

/** Casa, trabajo y otros sitios guardados a mano — para el atajo de un
 *  solo toque bajo "¿A dónde vas?" y como acceso rápido en el buscador. */
export function useSavedPlaces() {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    setIsAuthenticated(!!uid);
    if (!uid) {
      setPlaces([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('saved_places')
      .select('*')
      .eq('user_id', uid)
      // Casa y trabajo primero (si existen), luego el resto por fecha.
      .order('kind', { ascending: true })
      .order('created_at', { ascending: true });
    if (!error && data) setPlaces(data.map(rowToPlace));
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const addPlace = useCallback(async (place: NewSavedPlace) => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) throw new Error('Inicia sesión para guardar un sitio');
    const { error } = await supabase.from('saved_places').insert({
      user_id: uid,
      kind: place.kind,
      icon: place.icon ?? null,
      label: place.label,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
    });
    if (error) {
      // Único índice: ya hay una Casa/Trabajo guardada — mensaje claro en
      // vez del texto crudo de Postgres ("duplicate key value...").
      if (error.code === '23505') {
        throw new Error(place.kind === 'home' ? 'Ya tienes una Casa guardada — bórrala primero para cambiarla.' : 'Ya tienes un Trabajo guardado — bórralo primero para cambiarlo.');
      }
      throw new Error(error.message || 'No se pudo guardar el sitio');
    }
    await reload();
  }, [reload]);

  const removePlace = useCallback(async (id: string) => {
    setPlaces((prev) => prev.filter((p) => p.id !== id));
    const { error } = await supabase.from('saved_places').delete().eq('id', id);
    if (error) await reload();
  }, [reload]);

  return { places, isAuthenticated, loading, addPlace, removePlace };
}
