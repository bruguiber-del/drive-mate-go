// Sitios con coordenadas verificadas a mano, para cuando Mapbox no los tiene
// bien cargados (algunos aeropuertos regionales) o directamente no los tiene
// en absoluto (pabellones/polideportivos pequeños, por ejemplo). Generaliza
// lo que antes era solo para aeropuertos (majorAirports.ts) a cualquier
// categoría — hospitales, consulados, estaciones, pabellones... — para irla
// rellenando sitio a sitio, solo con los que de verdad lo necesitan: si
// Mapbox ya encuentra un sitio bien, no hace falta duplicarlo aquí.

export type PlaceCategory = 'airport' | 'train-station' | 'hospital' | 'consulate' | 'venue';

export interface NamedPlace {
  name: string;
  category: PlaceCategory;
  /** Palabras clave (sin acentos, en minúsculas) que deben coincidir con la búsqueda. */
  keywords: string[];
  lat: number;
  lng: number;
}

export const NAMED_PLACES: NamedPlace[] = [
  // Aeropuertos comerciales principales de España, con coordenadas de la
  // terminal verificadas contra Mapbox (búsqueda por categoría "airport").
  // Lista corta y estable a propósito — a diferencia de restaurantes,
  // gasolineras o estaciones de tren (que Mapbox ya devuelve perfectamente
  // bien con la búsqueda normal), algunos aeropuertos regionales no tienen
  // una entrada propia bien etiquetada en los datos de Mapbox: buscar
  // "aeropuerto" solo devuelve negocios que están dentro de ellos (alquiler
  // de coches, parking...), nunca el aeropuerto en sí. "Salidas" y
  // "llegadas" no se distinguen aparte: se comprobó contra Mapbox que en la
  // inmensa mayoría de aeropuertos españoles son el mismo edificio (solo
  // cambia de planta), así que un único punto por aeropuerto ya vale para
  // ambos casos.
  { name: 'Aeropuerto Adolfo Suárez Madrid-Barajas', category: 'airport', keywords: ['madrid', 'barajas'], lat: 40.4644332, lng: -3.5697845 },
  { name: 'Aeropuerto Josep Tarradellas Barcelona-El Prat', category: 'airport', keywords: ['barcelona', 'el prat', 'prat'], lat: 41.2890306, lng: 2.0742407 },
  { name: 'Aeropuerto de Palma de Mallorca', category: 'airport', keywords: ['palma', 'mallorca'], lat: 39.5475326, lng: 2.7318091 },
  { name: 'Aeropuerto de Ibiza', category: 'airport', keywords: ['ibiza', 'eivissa'], lat: 38.8729, lng: 1.3731 },
  { name: 'Aeropuerto de Menorca', category: 'airport', keywords: ['menorca', 'mahon', 'mao'], lat: 39.8626, lng: 4.2186 },
  { name: 'Aeropuerto de Málaga-Costa del Sol', category: 'airport', keywords: ['malaga', 'costa del sol'], lat: 36.676688, lng: -4.492336 },
  { name: 'Aeropuerto de Alicante-Elche Miguel Hernández', category: 'airport', keywords: ['alicante', 'elche'], lat: 38.2870575, lng: -0.5517775 },
  { name: 'Aeropuerto de Valencia', category: 'airport', keywords: ['valencia'], lat: 39.4913668, lng: -0.4736162 },
  { name: 'Aeropuerto de Gran Canaria', category: 'airport', keywords: ['gran canaria', 'las palmas'], lat: 27.9376016, lng: -15.3895056 },
  { name: 'Aeropuerto de Tenerife Sur', category: 'airport', keywords: ['tenerife sur', 'tenerife'], lat: 28.0473505, lng: -16.5788327 },
  { name: 'Aeropuerto de Bilbao', category: 'airport', keywords: ['bilbao'], lat: 43.30499, lng: -2.906134 },
  { name: 'Aeropuerto de Sevilla', category: 'airport', keywords: ['sevilla'], lat: 37.42027775, lng: -5.89079437 },

  // Pabellones/polideportivos que no aparecen en absoluto en Mapbox (se
  // comprobó buscando su nombre exacto y variantes: nada). Coordenadas
  // verificadas cruzando el BOIB (notificación oficial del Consell
  // d'Eivissa, 2018, "calle des Raspallar, s/n") y noticias locales con el
  // edificio del propio OpenStreetMap, con precisión a nivel de edificio.
  { name: 'Poliesportiu Sa Blanca Dona', category: 'venue', keywords: ['blanca dona', 'sa blanca dona'], lat: 38.9224887, lng: 1.4273834 },
];

const GENERIC_CATEGORY_WORDS: Record<PlaceCategory, string[]> = {
  airport: ['aeropuerto', 'airport'],
  'train-station': ['estacion de tren', 'estacion de trenes'],
  hospital: ['hospital', 'urgencias'],
  consulate: ['consulado', 'consulate'],
  venue: ['pabellon', 'pavellon', 'poliesportiu', 'polideportivo'],
};

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Finds the best-matching hand-verified place for a free-text search query,
 * or null if the query doesn't look like a match for any known category at
 * all.
 *
 * - A specific place's own keywords always win first (e.g. "blanca dona" or
 *   "ibiza"), regardless of what else is in the query ("salidas aeropuerto
 *   ibiza" still matches Ibiza).
 * - A bare category word with no specific place named ("aeropuerto" alone)
 *   matches the nearest entry of that category, if a user location is
 *   given, otherwise the first one in the list.
 */
export function findNamedPlace(
  query: string,
  userLocation?: [number, number] | null,
): NamedPlace | null {
  const q = stripAccents(query.trim().toLowerCase());
  if (!q) return null;

  const directMatch = NAMED_PLACES.find((p) => p.keywords.some((k) => q.includes(stripAccents(k))));
  if (directMatch) return directMatch;

  const matchedCategory = (Object.keys(GENERIC_CATEGORY_WORDS) as PlaceCategory[]).find((cat) =>
    GENERIC_CATEGORY_WORDS[cat].some((w) => q.includes(w)),
  );
  if (!matchedCategory) return null;

  const candidates = NAMED_PLACES.filter((p) => p.category === matchedCategory);
  if (candidates.length === 0) return null;

  if (!userLocation) return candidates[0];

  const [lat, lng] = userLocation;
  return candidates.reduce((closest, p) => {
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
    const dClosest = (closest.lat - lat) ** 2 + (closest.lng - lng) ** 2;
    return d < dClosest ? p : closest;
  }, candidates[0]);
}
