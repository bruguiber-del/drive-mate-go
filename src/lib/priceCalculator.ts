// Price calculator for VIMATCH — cost-sharing model (no profit)
// Formula:
//   precio_por_pasajero = (coste_total / (nº_pasajeros + 1)) × (1 + comision)
//   El "+1" es el propio conductor: el coste del tramo se reparte entre
//   todos los que van en el coche, él incluido.

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
  /** Total cost the driver pays (fuel + maintenance) */
  totalCost: number;
  /** Base price per passenger before commission */
  basePrice: number;
  /** Final price the passenger pays (includes su propia parte de comisión) */
  passengerPrice: number;
  /** What the driver collects per passenger (= basePrice), antes de restarle
   *  su propia parte de comisión */
  driverIncome: number;
  /** Lo recaudado de todos los pasajeros (basePrice × passengerCount), antes
   *  de restarle al conductor su propia parte de comisión */
  driverGrossIncome: number;
  /** La parte de comisión que paga el propio conductor — es un ocupante más
   *  del coche, así que también paga su parte del 12%, igual que cada
   *  pasajero paga la suya. Se calcula solo sobre el tramo compartido (sin
   *  el desvío ni los extras de cada pasajero, que son 100% suyos). */
  driverCommissionShare: number;
  /** Lo que el conductor se queda de verdad, ya descontada su propia parte
   *  de comisión (driverGrossIncome - driverCommissionShare) */
  driverTotalIncome: number;
  /** VIMATCH commission this passenger pays (su propia parte, en €) */
  commissionAmount: number;
  /** Comisión total de VIMATCH para todo el viaje: 12% del coste real,
   *  repartida entre TODOS los ocupantes (conductor incluido) — no solo
   *  entre los pasajeros. */
  totalCommission: number;
  /** Detour surcharge applied to base price */
  detourSurcharge: number;
  /** Suma de aportaciones fijas por mascota/silla infantil */
  extrasSurcharge: number;
  /** Traffic multiplier applied */
  trafficMultiplier: number;
}

/**
 * Calculate ride pricing using the VIMATCH cost-sharing formula.
 *
 * Example for 75km, 2 passengers, no detour, normal traffic:
 *   totalCost = 75 × 0.226 = 16.95€
 *   basePrice = 16.95 / 3 = 5.65€           (factor = 2 pasajeros + 1 conductor)
 *   passengerPrice = 5.65 × 1.12 = 6.33€    (cada pasajero, sin cambios)
 *   driverGrossIncome = 5.65 × 2 = 11.30€   (recaudado de los 2 pasajeros)
 *   driverCommissionShare = 5.65 × 0.12 = 0.68€  (su propia parte del 12%)
 *   driverTotalIncome = 11.30 − 0.68 = 10.62€    (lo que se queda de verdad)
 *   totalCommission = 2×0.68 + 0.68 = 2.03€      (= 12% de 16.95€ exacto)
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

  // Parte del tramo que de verdad es igual para cualquier ocupante (conductor
  // o pasajero) — sin el desvío ni los extras de ESTE pasajero en concreto,
  // que son 100% suyos y no se comparten con nadie, ni siquiera con el
  // conductor. Es la base sobre la que el conductor paga su propia comisión.
  const occupantBaseShare = (totalCost / factor) * trafficMultiplier;

  // Base price per passenger before commission
  const basePrice = occupantBaseShare + detourSurcharge * trafficMultiplier + extrasSurcharge;
  const passengerPrice = basePrice * (1 + COMMISSION);
  const commissionAmount = passengerPrice - basePrice;
  const driverIncome = basePrice;
  const driverGrossIncome = basePrice * passengerCount;
  // El conductor es un ocupante más: paga su propia parte de comisión sobre
  // su propio tramo compartido, igual que cada pasajero paga la suya.
  const driverCommissionShare = occupantBaseShare * COMMISSION;
  const driverTotalIncome = driverGrossIncome - driverCommissionShare;
  const totalCommission = commissionAmount * passengerCount + driverCommissionShare;

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
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
