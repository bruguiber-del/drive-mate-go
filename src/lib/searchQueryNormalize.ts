/**
 * Junta una letra suelta de elisión catalana/balear ("d", "l", "s", "n" —
 * de "d'Aragó", "l'Alguer", "s'Horta"...) con la palabra siguiente antes
 * de mandar la búsqueda a Mapbox.
 *
 * El teclado del móvil quita el apóstrofo al autocorregir/autocapitalizar
 * ("Carrer d'Aragó" → "Carrer d Arago"), y esa "d" suelta como palabra
 * aparte hace que Mapbox deje de encontrar la calle real: "carrer d arago
 * 92 eivissa" no encuentra nada en Ibiza (ni aunque se escriba el nombre
 * de la ciudad), pero "carrer darago 92 eivissa" (sin espacio, aunque
 * tampoco lleve el apóstrofo) sí — comprobado contra la propia API.
 */
export function normalizeSearchQuery(query: string): string {
  return query.replace(/\b([dlsn])\s+(?=\w)/gi, '$1');
}
