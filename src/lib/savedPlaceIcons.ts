import {
  Home, Briefcase, Star, Dumbbell, ShoppingCart, Heart, GraduationCap, Utensils,
  type LucideIcon,
} from 'lucide-react';
import type { SavedPlace } from '@/hooks/useSavedPlaces';

/** Catálogo corto de iconos elegibles a mano para un sitio de tipo
 *  "other" (Casa y Trabajo ya tienen el suyo fijo, no hace falta elegirlo). */
export const SAVED_PLACE_ICON_OPTIONS: { id: string; icon: LucideIcon; label: string }[] = [
  { id: 'star', icon: Star, label: 'Favorito' },
  { id: 'dumbbell', icon: Dumbbell, label: 'Gimnasio' },
  { id: 'shopping-cart', icon: ShoppingCart, label: 'Compras' },
  { id: 'heart', icon: Heart, label: 'Querido' },
  { id: 'graduation-cap', icon: GraduationCap, label: 'Estudios' },
  { id: 'utensils', icon: Utensils, label: 'Restaurante' },
];

const OTHER_ICON_BY_ID = new Map(SAVED_PLACE_ICON_OPTIONS.map((o) => [o.id, o.icon]));

export function getSavedPlaceIcon(place: Pick<SavedPlace, 'kind' | 'icon'>): LucideIcon {
  if (place.kind === 'home') return Home;
  if (place.kind === 'work') return Briefcase;
  return (place.icon && OTHER_ICON_BY_ID.get(place.icon)) || Star;
}
