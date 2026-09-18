// Aeropuertos comerciales principales de España, con coordenadas de la
// terminal verificadas contra Mapbox (búsqueda por categoría "airport").
// Lista corta y estable a propósito — a diferencia de restaurantes,
// gasolineras o estaciones de tren (que Mapbox ya devuelve perfectamente
// bien con la búsqueda normal), algunos aeropuertos regionales no tienen
// una entrada propia bien etiquetada en los datos de Mapbox: buscar
// "aeropuerto" solo devuelve negocios que están dentro de ellos (alquiler
// de coches, parking...), nunca el aeropuerto en sí. Este listado cubre
// justo ese hueco puntual, no pretende sustituir la búsqueda normal.

export interface MajorAirport {
  name: string;
  /** Palabras clave (sin acentos, en minúsculas) que deben coincidir con la búsqueda. */
  keywords: string[];
  lat: number;
  lng: number;
}

export const MAJOR_AIRPORTS: MajorAirport[] = [
  { name: 'Aeropuerto Adolfo Suárez Madrid-Barajas', keywords: ['madrid', 'barajas'], lat: 40.4644332, lng: -3.5697845 },
  { name: 'Aeropuerto Josep Tarradellas Barcelona-El Prat', keywords: ['barcelona', 'el prat', 'prat'], lat: 41.2890306, lng: 2.0742407 },
  { name: 'Aeropuerto de Palma de Mallorca', keywords: ['palma', 'mallorca'], lat: 39.5475326, lng: 2.7318091 },
  { name: 'Aeropuerto de Ibiza', keywords: ['ibiza', 'eivissa'], lat: 38.8729, lng: 1.3731 },
  { name: 'Aeropuerto de Menorca', keywords: ['menorca', 'mahon', 'mao'], lat: 39.8626, lng: 4.2186 },
  { name: 'Aeropuerto de Málaga-Costa del Sol', keywords: ['malaga', 'costa del sol'], lat: 36.676688, lng: -4.492336 },
  { name: 'Aeropuerto de Alicante-Elche Miguel Hernández', keywords: ['alicante', 'elche'], lat: 38.2870575, lng: -0.5517775 },
  { name: 'Aeropuerto de Valencia', keywords: ['valencia'], lat: 39.4913668, lng: -0.4736162 },
  { name: 'Aeropuerto de Gran Canaria', keywords: ['gran canaria', 'las palmas'], lat: 27.9376016, lng: -15.3895056 },
  { name: 'Aeropuerto de Tenerife Sur', keywords: ['tenerife sur', 'tenerife'], lat: 28.0473505, lng: -16.5788327 },
  { name: 'Aeropuerto de Bilbao', keywords: ['bilbao'], lat: 43.30499, lng: -2.906134 },
  { name: 'Aeropuerto de Sevilla', keywords: ['sevilla'], lat: 37.42027775, lng: -5.89079437 },
];

const GENERIC_AIRPORT_WORD = 'aeropuerto';

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Finds the best-matching major airport for a free-text search query, or
 * null if the query doesn't look like an airport search at all.
 *
 * - "aeropuerto" alone (no city) matches the nearest airport, if a user
 *   location is given, otherwise the first in the list (Madrid).
 * - "aeropuerto de ibiza", "ibiza airport", or just "ibiza" all match the
 *   Ibiza entry via its keywords.
 */
export function findMatchingAirport(
  query: string,
  userLocation?: [number, number] | null,
): MajorAirport | null {
  const q = stripAccents(query.trim().toLowerCase());
  if (!q) return null;

  const mentionsAirportWord = q.includes(GENERIC_AIRPORT_WORD);
  const cityMatch = MAJOR_AIRPORTS.find((a) => a.keywords.some((k) => q.includes(stripAccents(k))));

  if (cityMatch) return cityMatch;
  if (!mentionsAirportWord) return null;

  // Bare "aeropuerto" with no city named: pick the closest one if we know
  // where the user is, otherwise fall back to the first in the list.
  if (userLocation) {
    const [lat, lng] = userLocation;
    let closest = MAJOR_AIRPORTS[0];
    let bestDist = Infinity;
    for (const airport of MAJOR_AIRPORTS) {
      const d = (airport.lat - lat) ** 2 + (airport.lng - lng) ** 2;
      if (d < bestDist) {
        bestDist = d;
        closest = airport;
      }
    }
    return closest;
  }
  return MAJOR_AIRPORTS[0];
}
