import { useState, useEffect } from "react";

export interface DriverSettings {
  seats: number;
  maxDetour: number;
  acceptsPets: boolean;
  hasChildSeat: boolean;
  doorToDoor: boolean;
  genderPreference: "none" | "women" | "men";
}

const STORAGE_KEY = "vimatch_driver_settings";

const DEFAULTS: DriverSettings = {
  seats: 3,
  maxDetour: 5,
  acceptsPets: false,
  hasChildSeat: false,
  doorToDoor: true,
  genderPreference: "none",
};

/** Lee los ajustes guardados sin confiar en ellos: cualquier campo inválido
 *  vuelve a su valor por defecto. */
function loadSettings(): DriverSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || typeof raw !== "object") return DEFAULTS;
    return {
      seats: Number.isInteger(raw.seats) && raw.seats >= 1 && raw.seats <= 4 ? raw.seats : DEFAULTS.seats,
      maxDetour: Number.isInteger(raw.maxDetour) && raw.maxDetour >= 0 && raw.maxDetour <= 15 ? raw.maxDetour : DEFAULTS.maxDetour,
      acceptsPets: typeof raw.acceptsPets === "boolean" ? raw.acceptsPets : DEFAULTS.acceptsPets,
      hasChildSeat: typeof raw.hasChildSeat === "boolean" ? raw.hasChildSeat : DEFAULTS.hasChildSeat,
      doorToDoor: typeof raw.doorToDoor === "boolean" ? raw.doorToDoor : DEFAULTS.doorToDoor,
      genderPreference: ["none", "women", "men"].includes(raw.genderPreference) ? raw.genderPreference : DEFAULTS.genderPreference,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Ajustes del conductor guardados en este dispositivo: sobreviven a recargas. */
export function useDriverSettings() {
  const [settings, setSettings] = useState<DriverSettings>(loadSettings);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* almacenamiento no disponible — los ajustes siguen funcionando en memoria */
    }
  }, [settings]);

  return [settings, setSettings] as const;
}
