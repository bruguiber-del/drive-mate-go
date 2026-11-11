import type { GpsStatus } from "@/components/MapView";
import { overlayTop } from "@/lib/overlayLayout";

const MESSAGES: Record<Exclude<GpsStatus, "ok">, string> = {
  searching: "Buscando tu ubicación…",
  denied: "Sin permiso de ubicación. Actívalo en Ajustes → Privacidad → Localización → Safari.",
  lost: "Señal GPS perdida, buscando…",
  unavailable: "Este dispositivo no tiene ubicación.",
};

// El propio mapa ya reintenta solo cada 4s mientras no haya GPS — este
// botón solo sirve para no tener que esperar a ese ciclo después de haber
// cambiado el permiso en los ajustes del navegador.
const RETRYABLE: ReadonlySet<GpsStatus> = new Set(["denied", "lost"]);

/** Aviso persistente mientras no hay una posición real del dispositivo. */
const GpsStatusBanner = ({ status }: { status: GpsStatus }) => {
  if (status === "ok") return null;
  return (
    <div
      className="fixed left-3 right-3 z-40 pointer-events-none flex justify-center"
      style={{ top: overlayTop(112) }}
    >
      <div className="glass-strong rounded-full px-3 py-1.5 flex items-center gap-2 text-[11px] font-medium text-warning text-center">
        <span>{MESSAGES[status]}</span>
        {RETRYABLE.has(status) && (
          <button
            type="button"
            onClick={() => (window as any).__mapRetryGps?.()}
            className="pointer-events-auto underline shrink-0"
          >
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
};

export default GpsStatusBanner;
