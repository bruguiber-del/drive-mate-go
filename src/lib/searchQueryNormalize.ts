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

/** "aragon"/"aragón" → "arago"/"aragó" — topónimos catalanes acabados en
 *  "-ó" que en castellano se escriben con "-ón" (Aragón/Aragó, Castellón/
 *  Castelló...). Se usa como último recurso cuando ni la consulta tal
 *  cual ni sin la última palabra encuentran nada cerca — null si la
 *  palabra no acaba así, para no tocar nada que no venga al caso. */
export function dropTrailingN(word: string): string | null {
  return /[oó]n$/i.test(word) ? word.slice(0, -1) : null;
}

/** "de aragon" → "darago" — lo normal al escribir en castellano es "de
 *  Aragón" (con el artículo separado, a la española), pero el nombre
 *  real catalán no lleva "de" en absoluto, lleva "d'" pegado al
 *  topónimo ("d'Aragó"). Confirmado contra la propia API: "carrer de
 *  arago 92" (quitando solo la "n") seguía sin encontrar nada cerca,
 *  pero "carrer darago 92" (quitando también el "de") sí, el primero de
 *  la lista y a 245m de la posición probada. Null si la palabra "de" no
 *  precede a un topónimo en "-on"/"-ón", para no tocar nada más. */
export function mergeDeWithTrailingN(words: string[]): string[] | null {
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i].toLowerCase() !== 'de') continue;
    const merged = dropTrailingN(words[i + 1]);
    if (!merged) continue;
    return [...words.slice(0, i), `d${merged}`, ...words.slice(i + 2)];
  }
  return null;
}

/** Más allá de esta distancia (metros) un resultado no cuenta como
 *  "cerca de ti" — Mapbox puede preferir una coincidencia de texto
 *  exacta pero a cientos de km antes que una parecida pero al lado,
 *  así que no basta con mirar si hay ALGÚN resultado. */
export const FAR_SUGGESTION_THRESHOLD_M = 80_000;

