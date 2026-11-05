import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { COUNTRY_CALLING_CODES } from "@/lib/countryCallingCodes";

const DEFAULT_DIAL_CODE = "+34";
// Prefijos más largos primero, para que "+1876" (Jamaica) no se confunda
// con el "+1" genérico de Norteamérica al partir un número ya guardado.
const SORTED_CODES = [...COUNTRY_CALLING_CODES].sort((a, b) => b.dialCode.length - a.dialCode.length);

function splitPhone(full: string): { dialCode: string; national: string } {
  const trimmed = full.trim();
  if (!trimmed) return { dialCode: DEFAULT_DIAL_CODE, national: "" };
  const match = SORTED_CODES.find((c) => trimmed.startsWith(c.dialCode));
  if (!match) return { dialCode: DEFAULT_DIAL_CODE, national: trimmed.replace(/^\+/, "") };
  return { dialCode: match.dialCode, national: trimmed.slice(match.dialCode.length) };
}

interface PhoneNumberInputProps {
  /** Número completo, con prefijo (p. ej. "+34600111222"). */
  value: string;
  onChange: (fullNumber: string) => void;
  id?: string;
  nationalPlaceholder?: string;
}

/**
 * Teléfono con selector de prefijo de país (buscable) + número nacional —
 * antes había que escribir el prefijo a mano (+34, +44...), lo que fallaba
 * fácilmente para cualquiera que no fuera de España. El valor que sale por
 * onChange sigue siendo un único string en formato internacional (E.164).
 */
export function PhoneNumberInput({ value, onChange, id, nationalPlaceholder = "600 111 222" }: PhoneNumberInputProps) {
  const [dialCode, setDialCode] = useState(() => splitPhone(value).dialCode);
  const [national, setNational] = useState(() => splitPhone(value).national);

  // Resincroniza si el valor llega desde fuera (p. ej. el perfil cargado
  // de la base de datos) y no coincide con lo que ya tenemos montado aquí.
  useEffect(() => {
    if (value && value !== `${dialCode}${national}`) {
      const split = splitPhone(value);
      setDialCode(split.dialCode);
      setNational(split.national);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const options = useMemo(
    () =>
      COUNTRY_CALLING_CODES.map((c) => ({
        value: c.iso2,
        label: `${c.dialCode} ${c.name}`,
      })),
    [],
  );

  const selectedIso2 = useMemo(
    () => COUNTRY_CALLING_CODES.find((c) => c.dialCode === dialCode)?.iso2 ?? "ES",
    [dialCode],
  );

  const update = (nextDialCode: string, nextNational: string) => {
    const digitsOnly = nextNational.replace(/\D/g, "");
    setDialCode(nextDialCode);
    setNational(digitsOnly);
    onChange(`${nextDialCode}${digitsOnly}`);
  };

  return (
    <div className="flex gap-2">
      <Combobox
        options={options}
        value={selectedIso2}
        onChange={(iso2) => {
          const next = COUNTRY_CALLING_CODES.find((c) => c.iso2 === iso2);
          if (next) update(next.dialCode, national);
        }}
        placeholder="Prefijo"
        searchPlaceholder="Buscar país..."
        emptyText="Ningún país coincide."
        triggerClassName="w-[148px] shrink-0 truncate"
      />
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        placeholder={nationalPlaceholder}
        value={national}
        onChange={(e) => update(dialCode, e.target.value)}
        className="flex-1"
      />
    </div>
  );
}
