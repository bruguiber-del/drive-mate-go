import type { RouteLane } from '@/hooks/useRouting';

/** Mapbox manda "indications" como left/slight left/sharp left/straight/
 *  right/slight right/sharp right/uturn — mismo vocabulario que ya usa
 *  maneuverIcons.tsx para la maniobra principal, aquí convertido a un
 *  ángulo de rotación para una sola flecha en vez de un icono por caso. */
const ROTATION_BY_INDICATION: Record<string, number> = {
  'sharp left': -135,
  left: -90,
  'slight left': -45,
  straight: 0,
  'slight right': 45,
  right: 90,
  'sharp right': 135,
  uturn: 180,
};

function primaryIndication(lane: RouteLane): string {
  // Si el carril sirve para varias direcciones (p. ej. recto o derecha),
  // se prioriza la que de verdad hace falta seguir en la ruta.
  return lane.indications.find((i) => i !== 'straight') ?? lane.indications[0] ?? 'straight';
}

/**
 * Carriles del cruce/autovía justo antes de girar — antes esta información
 * ya venía de Mapbox (banner_instructions) pero se descartaba sin usarla,
 * así que en una vía de varios carriles nunca se señalaba cuál coger.
 * Los carriles válidos para esta maniobra se ven brillantes; el resto,
 * apagados — igual que Waze/Google Maps.
 */
const LaneGuidance = ({ lanes }: { lanes: RouteLane[] }) => {
  return (
    <div className="flex items-center gap-1 mt-1.5" aria-label="Carriles para esta maniobra">
      {lanes.map((lane, i) => {
        const rotation = ROTATION_BY_INDICATION[primaryIndication(lane)] ?? 0;
        return (
          <div
            key={i}
            className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
              lane.active ? 'bg-primary' : 'bg-muted/60'
            }`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={lane.active ? 'text-primary-foreground' : 'text-muted-foreground'}
              style={{ transform: `rotate(${rotation}deg)` }}
            >
              <path d="M12 19V5" />
              <path d="M6 11l6-6 6 6" />
            </svg>
          </div>
        );
      })}
    </div>
  );
};

export default LaneGuidance;
