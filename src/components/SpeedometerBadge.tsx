export interface SpeedInfo {
  kmh: number;
  /** null cuando Mapbox no tiene dato de límite para este tramo — no
   *  cuando el tramo no tenga límite de verdad. */
  limitKmh: number | null;
}

/**
 * Velocímetro en vivo durante la navegación — antes no había ninguna
 * referencia de a qué velocidad vas ni de si te has pasado del límite de
 * la vía en la que estás. Un círculo blanco normal; si te pasas del
 * límite conocido para este tramo, se pone rojo entero (número y límite),
 * como el resto de apps de navegación.
 */
const SpeedometerBadge = ({ info }: { info: SpeedInfo }) => {
  const overLimit = info.limitKmh != null && info.kmh > info.limitKmh;

  return (
    <div
      className={`relative w-16 h-16 rounded-full flex flex-col items-center justify-center shrink-0 border-4 shadow-lg transition-colors ${
        overLimit ? 'bg-destructive border-destructive-foreground/30' : 'bg-card border-border'
      }`}
    >
      <span className={`text-2xl font-extrabold leading-none tabular-nums ${overLimit ? 'text-destructive-foreground' : 'text-foreground'}`}>
        {info.kmh}
      </span>
      <span className={`text-[8px] font-medium leading-none mt-0.5 ${overLimit ? 'text-destructive-foreground/80' : 'text-muted-foreground'}`}>
        km/h
      </span>
      {info.limitKmh != null && (
        <span
          className={`absolute -bottom-1.5 text-[9px] font-bold leading-none px-1.5 py-0.5 rounded-full border-2 ${
            overLimit
              ? 'bg-destructive-foreground text-destructive border-destructive-foreground'
              : 'bg-background text-foreground border-foreground/60'
          }`}
        >
          {info.limitKmh}
        </span>
      )}
    </div>
  );
};

export default SpeedometerBadge;
