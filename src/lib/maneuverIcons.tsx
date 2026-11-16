import type { LucideIcon } from 'lucide-react';
import {
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  CornerUpLeft,
  CornerUpRight,
  ArrowUpLeft,
  ArrowUpRight,
  RotateCcw,
  RotateCw,
  Merge,
  Split,
  Flag,
  Navigation,
  MapPin,
} from 'lucide-react';

/**
 * Mapbox devuelve maneuver.type (turn, roundabout, arrive…) y maneuver.modifier
 * (left, right, slight left, sharp right, uturn, straight…). Aquí los
 * traducimos al icono de flecha adecuado, tipo Waze/Google Maps.
 */

const BY_MODIFIER: Record<string, LucideIcon> = {
  left: CornerUpLeft,
  right: CornerUpRight,
  'slight left': ArrowUpLeft,
  'slight right': ArrowUpRight,
  'sharp left': ArrowLeft,
  'sharp right': ArrowRight,
  straight: ArrowUp,
  uturn: RotateCcw,
};

const IMPORTANT_TYPES = new Set(['fork', 'off ramp', 'on ramp', 'end of road']);
const SHARP_MODIFIERS = new Set(['sharp left', 'sharp right']);

/** Maniobras que suelen verse mal con el zoom normal de navegación: una
 *  bifurcación/carril de entrada o salida (varias vías muy juntas en
 *  pantalla) o un giro cerrado — justo las que el usuario pidió que
 *  acercaran el mapa al aproximarse. */
export function isImportantManeuver(type?: string, modifier?: string): boolean {
  const t = (type ?? '').toLowerCase();
  const m = (modifier ?? '').toLowerCase();
  return IMPORTANT_TYPES.has(t) || SHARP_MODIFIERS.has(m);
}

export function getManeuverIcon(type?: string, modifier?: string): LucideIcon {
  const t = (type ?? '').toLowerCase();
  const m = (modifier ?? '').toLowerCase();

  if (t === 'arrive') return Flag;
  if (t === 'depart') return Navigation;
  if (t === 'merge') return Merge;
  if (t === 'fork') return Split;
  if (t === 'roundabout' || t === 'rotary' || t === 'roundabout turn') {
    return m === 'left' || m === 'slight left' || m === 'sharp left' ? RotateCcw : RotateCw;
  }
  if (t === 'waypoint' || t === 'notification') return MapPin;

  return BY_MODIFIER[m] ?? ArrowUp;
}
