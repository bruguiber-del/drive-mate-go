// Price calculator for VIMATCH — cost-sharing model (no profit)
// Formula:
//   tramo_compartido = (coste_real_del_trayecto) / (nº_pasajeros + 1)
//   comisión_del_par = tramo_compartido × 12%, repartida a MEDIAS entre el
//     conductor y ESE pasajero (6 puntos cada uno) — ninguno paga el 12%
//     completo él solo. Ni el desvío ni los extras llevan comisión: son
//     coste real de ese pasajero en concreto, sin margen.
//   precio_pasajero = tramo_compartido + desvío + extras + su mitad de comisión
//   conductor_recibe = tramo_compartido + desvío + extras − su mitad de comisión

import { LEGAL_MAX_COST_PER_KM } from '@/lib/vehiclePricing';

// ── Constants (fuel + maintenance) ───────────────────────────────────────────
// Respaldo genérico para cuando no hay un vehículo concreto (o su coste/km)
// — un conductor real siempre tiene uno activo, así que esto rara vez se usa
// para precios de verdad. Actualizado a precios de finales de 2026 (antes
// asumía gasolina a 1,65€/L, ya muy por debajo de la realidad).
export const FUEL_COST_PER_KM = 0.126;       // €/km (gasolina ~1,94€, 6,5L/100km)
export const MAINTENANCE_PER_KM = 0.10;      // €/km (ruedas, revisiones, etc.)
export const TOTAL_COST_PER_KM = FUEL_COST_PER_KM + MAINTENANCE_PER_KM; // ≈0,226 €/km
export const COMMISSION = 0.12;              // 12% VIMATCH

// Aportaciones fijas por extras — justificadas como reparto de un coste real
// del conductor (material de protección, limpieza, amortización del
// accesorio), nunca como un suplemento de tarifa comercial. La LOTT exige
// que el cobro del carpooling sea estrictamente reparto de costes: por eso
// "puerta a puerta" NO lleva aportación fija (ver más abajo) — su único
// coste real es el desvío que cause, y ese ya se cobra por km real.
export const PET_SURCHARGE = 2;              // €, material de protección + limpieza del habitáculo
export const CHILD_SEAT_SURCHARGE = 1;       // €, amortización y ocupación del sistema de retención infantil

// Reparto del tramo: entre el conductor y todos los pasajeros a bordo en
// ese momento, contando al conductor como uno más — como un grupo que se
// reparte la gasolina de un viaje incluyéndose ellos mismos. Así el
// conductor nunca recupera el 100% del coste real (siempre se queda su
// propia parte sin cobrar), lo que deja el reparto claramente del lado
// seguro de "sin ánimo de lucro" frente al tope legal (LEGAL_MAX_COST_PER_KM).
function occupancyFactor(passengerCount: number): number {
  return passengerCount + 1;
}

export type TrafficFactor = 'normal' | 'moderate' | 'rush';
const TRAFFIC_MULTIPLIER: Record<TrafficFactor, number> = {
  normal: 1.0,
  moderate: 1.15,
  rush: 1.3,
};

export interface PriceInput {
  distanceKm: number;
  passengerCount: 1 | 2 | 3 | 4;
  detourKm?: number;       // extra km the driver does
  traffic?: TrafficFactor;
  /** Cost per km of the active vehicle; falls back to the generic constant */
  costPerKm?: number;
  /** Extras — cada uno añade su aportación fija, de verdad, al precio final.
   *  "Puerta a puerta" no está aquí: no tiene coste propio más allá del
   *  desvío que cause, y ese ya se cobra por detourKm real (ver abajo). */
  hasPet?: boolean;
  hasChildSeat?: boolean;
}


export interface PriceBreakdown {
  /** Coste real de este tramo (recogida → bajada de este pasajero), antes de
   *  repartir entre ocupantes. */
  totalCost: number;
  /** tripShare + detourCharge + extrasSurcharge — antes de la comisión. */
  basePrice: number;
  /** Final price the passenger pays: basePrice + su mitad de la comisión. */
  passengerPrice: number;
  /** Lo que el conductor recibe de ESTE pasajero, ya descontada su propia
   *  mitad de la comisión (basePrice - driverCommissionShare). */
  driverIncome: number;
  /** Lo recaudado de todos los pasajeros (basePrice × passengerCount), antes
   *  de restarle al conductor su propia parte de comisión. */
  driverGrossIncome: number;
  /** La mitad de la comisión de ESTE par conductor-pasajero que paga el
   *  conductor — ninguno de los dos paga el 12% completo, cada uno paga 6
   *  puntos. Se calcula solo sobre tripShare: ni el desvío ni los extras de
   *  este pasajero llevan comisión, son coste real suyo sin margen. */
  driverCommissionShare: number;
  /** Lo que el conductor se queda de verdad, sumado para los passengerCount
   *  pasajeros (driverIncome × passengerCount, con pasajeros iguales). */
  driverTotalIncome: number;
  /** La mitad de la comisión de este par que paga el pasajero (misma cifra
   *  que driverCommissionShare: la comisión se reparte a medias). */
  commissionAmount: number;
  /** Comisión total de VIMATCH por este pasajero: su mitad + la del
   *  conductor por este mismo tramo (commissionAmount + driverCommissionShare). */
  totalCommission: number;
  /** Detour surcharge applied to base price */
  detourSurcharge: number;
  /** Suma de aportaciones fijas por mascota/silla infantil */
  extrasSurcharge: number;
  /** Traffic multiplier applied */
  trafficMultiplier: number;
  /** Tramo compartido: coste real del trayecto ÷ (pasajeros+1), con el
   *  multiplicador de tráfico aplicado — la base sobre la que se calcula la
   *  comisión (tripShare + detourCharge + extrasSurcharge = basePrice). */
  tripShare: number;
  /** Lo que le costó su propio desvío, ya con el multiplicador de tráfico
   *  aplicado — a diferencia de detourSurcharge (el valor crudo, sin
   *  tráfico), este es el que de verdad suma con tripShare y extrasSurcharge
   *  para dar basePrice. Sin comisión: es 100% coste real suyo. */
  detourCharge: number;
}

/**
 * Calculate ride pricing using the VIMATCH cost-sharing formula.
 *
 * Example for 75km, 2 passengers, no detour, normal traffic:
 *   totalCost = 75 × 0.226 = 16.95€
 *   tripShare = 16.95 / 3 = 5.65€             (factor = 2 pasajeros + 1 conductor)
 *   pairCommission = 5.65 × 0.12 = 0.68€      (comisión de ESTE par, antes de repartir)
 *   commissionAmount = driverCommissionShare = 0.68 / 2 = 0.34€  (mitad cada uno)
 *   passengerPrice = 5.65 + 0.34 = 5.99€
 *   driverIncome = 5.65 − 0.34 = 5.31€        (de ESTE pasajero)
 *   driverTotalIncome = 5.31 × 2 = 10.62€     (de los 2 pasajeros)
 *   totalCommission = (0.34 + 0.34) × 2 = 1.36€
 */
export function calculatePrice({
  distanceKm,
  passengerCount,
  detourKm = 0,
  traffic = 'normal',
  costPerKm,
  hasPet = false,
  hasChildSeat = false,
}: PriceInput): PriceBreakdown {
  const factor = occupancyFactor(passengerCount);
  const trafficMultiplier = TRAFFIC_MULTIPLIER[traffic];

  // Tope de seguridad: sea cual sea el coste/km que llegue (el del vehículo
  // activo, el del fallback genérico, o uno calculado fuera), el precio
  // nunca se basa en un coste por km mayor que el que Hacienda reconoce
  // como gasto real de usar tu coche (ver LEGAL_MAX_COST_PER_KM) — es el
  // criterio que ya usan las autoridades para distinguir reparto de gastos
  // de transporte con ánimo de lucro.
  const costPerKmToUse = Math.min(costPerKm ?? TOTAL_COST_PER_KM, LEGAL_MAX_COST_PER_KM);
  const totalCost = distanceKm * costPerKmToUse;
  const detourSurcharge = detourKm * costPerKmToUse;

  // Aportaciones fijas — no dependen del tráfico ni se reparten por
  // ocupación, son un coste real directo de este pasajero (material,
  // limpieza, amortización). "Puerta a puerta" no suma nada aquí: su coste
  // real ya está dentro de detourSurcharge, según los km que de verdad
  // desvíe recoger/dejar exactamente en la puerta.
  const extrasSurcharge =
    (hasPet ? PET_SURCHARGE : 0) +
    (hasChildSeat ? CHILD_SEAT_SURCHARGE : 0);

  // Tramo compartido: coste real ÷ ocupantes — la parte que de verdad es
  // igual para cualquier ocupante (conductor o pasajero). Ni el desvío ni
  // los extras de ESTE pasajero entran aquí: son 100% suyos, sin repartir
  // con nadie y sin comisión — solo el tramo compartido lleva margen.
  const tripShare = (totalCost / factor) * trafficMultiplier;
  const detourCharge = detourSurcharge * trafficMultiplier;

  // La comisión del 12% es de ESTE PAR conductor-pasajero, sobre su tramo
  // compartido — y se reparte a MEDIAS entre los dos, nunca el 12% completo
  // por cada lado (eso serían 24 puntos entre los dos, no 12).
  const pairCommission = tripShare * COMMISSION;
  const commissionAmount = pairCommission / 2;       // lo que aporta el pasajero
  const driverCommissionShare = pairCommission / 2;  // lo que aporta el conductor — misma cifra

  const basePrice = tripShare + detourCharge + extrasSurcharge;
  const passengerPrice = basePrice + commissionAmount;
  const driverIncome = basePrice - driverCommissionShare;

  // Agregados "si todos los pasajeros fueran como este" — ningún sitio de
  // la app los usa para cobrar de verdad (cada pasajero tiene su propio
  // tramo y se le llama aparte), solo sirven de referencia/resumen.
  const driverGrossIncome = basePrice * passengerCount;
  const driverTotalIncome = driverIncome * passengerCount;
  const totalCommission = (commissionAmount + driverCommissionShare) * passengerCount;

  return {
    totalCost: round2(totalCost),
    basePrice: round2(basePrice),
    passengerPrice: round2(passengerPrice),
    driverIncome: round2(driverIncome),
    driverGrossIncome: round2(driverGrossIncome),
    driverCommissionShare: round2(driverCommissionShare),
    driverTotalIncome: round2(driverTotalIncome),
    commissionAmount: round2(commissionAmount),
    totalCommission: round2(totalCommission),
    detourSurcharge: round2(detourSurcharge),
    extrasSurcharge: round2(extrasSurcharge),
    trafficMultiplier,
    tripShare: round2(tripShare),
    detourCharge: round2(detourCharge),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
