/** Alturas (px desde el borde inferior) de los controles flotantes del mapa.
 *  Un solo sitio donde ajustarlas: las columnas de cada esquina dependen unas
 *  de otras (p. ej. las chapas de pasajero no deben tapar el zoom). */
export const OVERLAY_BOTTOM_PX = {
  /** Modo conductor/pasajero (izquierda) y zoom/centrar (derecha). */
  cornerControls: 20,
  /** Lupa de añadir parada (izquierda), justo encima de los modos. */
  addStopButton: 130,
  /** Chapas de recogida/bajada de pasajeros (derecha), encima del zoom. */
  stopPills: 160,
  /** Total "Compensado" centrado abajo. */
  compensatedBadge: 70,
  /** Chapa de aceptar solicitud de pasajero (derecha). */
  acceptPill: 320,
} as const;
