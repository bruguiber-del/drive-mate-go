import { useCallback, useEffect, useRef, useState } from 'react';
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
  /** Orden elegido a mano arrastrando la lista — no depende de kind/fecha. */
  position: number;
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
    position: row.position,
  };
}

/** Casa, trabajo y otros sitios guardados a mano — para el atajo de un
 *  solo toque bajo "¿A dónde vas?" y como acceso rápido en el buscador. */
export function useSavedPlaces() {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const placesRef = useRef<SavedPlace[]>([]);
  placesRef.current = places;

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
      .order('position', { ascending: true });
    if (!error && data) setPlaces(data.map(rowToPlace));
    setLoading(false);
  }, []);

  // Un solo reload() al montar no bastaba: en la app nativa, al abrir en
  // frío, Supabase tarda un poco en restaurar la sesión guardada — si este
  // reload() se ejecutaba antes de que terminara, getUser() no encontraba
  // a nadie todavía y Casa/Trabajo se quedaban sin cargar para siempre (no
  // había nada que disparara un segundo intento). Suscribirse a los
  // cambios de sesión asegura un reload() más en cuanto la sesión esté de
  // verdad lista, igual que ya hace useVehicles para el mismo problema.
  useEffect(() => {
    reload();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { reload(); });
    return () => sub.subscription.unsubscribe();
  }, [reload]);

  const addPlace = useCallback(async (place: NewSavedPlace) => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) throw new Error('Inicia sesión para guardar un sitio');
    // Un sitio nuevo va al final de la lista, no revuelve el orden que ya
    // haya elegido el usuario a mano.
    const nextPosition = placesRef.current.reduce((max, p) => Math.max(max, p.position), -1) + 1;
    const { error } = await supabase.from('saved_places').insert({
      user_id: uid,
      kind: place.kind,
      icon: place.icon ?? null,
      label: place.label,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      position: nextPosition,
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

  // Recibe la lista ya en el orden nuevo (subir/bajar en Ajustes) — se
  // aplica al estado local al instante (para que no "rebote" mientras
  // llega la respuesta) y se guarda en UNA sola petición. Antes mandaba
  // una petición de update por sitio EN PARALELO: si cualquiera de ellas
  // iba más lenta que las demás o fallaba, se disparaba un reload() que
  // podía traer de vuelta un orden a medias (unas filas ya actualizadas,
  // otras no) — se veía como si tardara o se revirtiera sola. Con upsert,
  // es una sola petición atómica.
  const reorderPlaces = useCallback(async (orderedPlaces: SavedPlace[]) => {
    setPlaces(orderedPlaces);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return;
    const { error } = await supabase.from('saved_places').upsert(
      orderedPlaces.map((p, i) => ({
        id: p.id,
        user_id: uid,
        kind: p.kind,
        icon: p.icon,
        label: p.label,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        position: i,
      })),
    );
    if (error) await reload();
  }, [reload]);

  return { places, isAuthenticated, loading, addPlace, removePlace, reorderPlaces };
}
