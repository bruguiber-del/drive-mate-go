// Avisos de carretera estilo Waze — qué tipos existen, cómo se llaman, y
// cuánto dura cada uno antes de caducar solo si nadie lo confirma. Un
// radar fijo dura más que un atasco, que cambia en minutos.
export type RoadAlertKind = 'radar' | 'policia' | 'accidente' | 'obstaculo' | 'obra' | 'atasco';

export const ROAD_ALERT_KINDS: RoadAlertKind[] = ['radar', 'policia', 'accidente', 'obstaculo', 'obra', 'atasco'];

export const ROAD_ALERT_LABEL: Record<RoadAlertKind, string> = {
  radar: 'Radar',
  policia: 'Policía',
  accidente: 'Accidente',
  obstaculo: 'Obstáculo',
  obra: 'Obras',
  atasco: 'Atasco',
};

/** Cuánto dura cada tipo (segundos) antes de caducar solo si nadie lo
 *  confirma — un atasco cambia en minutos, unas obras duran días. */
export const ROAD_ALERT_DEFAULT_DURATION_S: Record<RoadAlertKind, number> = {
  radar: 3 * 60 * 60,
  policia: 2 * 60 * 60,
  accidente: 4 * 60 * 60,
  obstaculo: 4 * 60 * 60,
  obra: 12 * 60 * 60,
  atasco: 60 * 60,
};

/** Cuánto se alarga al confirmar "sigue ahí" — la mitad de su duración
 *  normal, no otra vez entera (si ya llevaba un rato puesto, es más
 *  probable que esté a punto de irse que recién llegado). */
export const ROAD_ALERT_CONFIRM_EXTEND_S: Record<RoadAlertKind, number> = {
  radar: (3 * 60 * 60) / 2,
  policia: (2 * 60 * 60) / 2,
  accidente: (4 * 60 * 60) / 2,
  obstaculo: (4 * 60 * 60) / 2,
  obra: (12 * 60 * 60) / 2,
  atasco: (60 * 60) / 2,
};

/** Por debajo de esto no merece la pena avisar en voz/pantalla de un aviso
 *  próximo — más lejos, se enseña en el mapa pero sin interrumpir. */
export const ROAD_ALERT_WARN_DISTANCE_M = 600;
