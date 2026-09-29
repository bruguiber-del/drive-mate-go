// Price calculator for VIMATCH — cost-sharing model (no profit)
// Formula:
//   precio_por_pasajero = (coste_total / factor_ocupacion) × (1 + comision)

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

// Occupancy factors (NOT linear: more passengers, less penalty per seat)
const OCCUPANCY_FACTORS: Record<number, number> = {
  1: 1.8,
  2: 2.5,
  3: 3.8,
  4: 4.5,
};

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
  /** Final price the passenger pays (includes commission) */
  passengerPrice: number;
  /** What the driver receives per passenger (= basePrice) */
  driverIncome: number;
  /** Total income the driver receives (basePrice × passengerCount) */
  driverTotalIncome: number;
  /** VIMATCH commission per passenger (in €) */
  commissionAmount: number;
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
 *   basePrice = 16.95 / 2.5 = 6.78€
 *   passengerPrice = 6.78 × 1.12 = 7.59€
 *   driverTotalIncome = 6.78 × 2 = 13.56€
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
  const factor = OCCUPANCY_FACTORS[passengerCount] ?? OCCUPANCY_FACTORS[1];
  const trafficMultiplier = TRAFFIC_MULTIPLIER[traffic];

  const costPerKmToUse = costPerKm ?? TOTAL_COST_PER_KM;
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

  // Base price per passenger before commission
  const basePrice = (totalCost / factor + detourSurcharge) * trafficMultiplier + extrasSurcharge;
  const passengerPrice = basePrice * (1 + COMMISSION);
  const commissionAmount = passengerPrice - basePrice;
  const driverIncome = basePrice;
  const driverTotalIncome = basePrice * passengerCount;

  return {
    totalCost: round2(totalCost),
    basePrice: round2(basePrice),
    passengerPrice: round2(passengerPrice),
    driverIncome: round2(driverIncome),
    driverTotalIncome: round2(driverTotalIncome),
    commissionAmount: round2(commissionAmount),
    detourSurcharge: round2(detourSurcharge),
    extrasSurcharge: round2(extrasSurcharge),
    trafficMultiplier,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
