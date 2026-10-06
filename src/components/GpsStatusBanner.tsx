import type { GpsStatus } from "@/components/MapView";

const MESSAGES: Record<Exclude<GpsStatus, "ok">, string> = {
  searching: "Buscando tu ubicación…",
  denied: "Ubicación desactivada. Actívala en los ajustes del navegador para navegar.",
  lost: "Señal GPS perdida, buscando…",
  unavailable: "Este dispositivo no tiene ubicación.",
};

/** Aviso persistente mientras no hay una posición real del dispositivo. */
const GpsStatusBanner = ({ status }: { status: GpsStatus }) => {
  if (status === "ok") return null;
  return (
    <div className="fixed top-28 left-3 right-3 z-40 pointer-events-none flex justify-center">
      <div className="glass-strong rounded-full px-3 py-1.5 text-[11px] font-medium text-warning text-center">
        {MESSAGES[status]}
      </div>
    </div>
  );
};

export default GpsStatusBanner;
