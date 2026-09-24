// Price calculator for VIMATCH — cost-sharing model (no profit)
// Formula:
//   precio_por_pasajero = (coste_total / factor_ocupacion) × (1 + comision)

// ── Constants (fuel + maintenance) ───────────────────────────────────────────
export const FUEL_COST_PER_KM = 0.17;        // €/km (gasolina 1,65€, 6,5L/100km)
export const MAINTENANCE_PER_KM = 0.10;      // €/km (ruedas, seguro, etc.)
export const TOTAL_COST_PER_KM = FUEL_COST_PER_KM + MAINTENANCE_PER_KM; // 0.27 €/km
export const COMMISSION = 0.12;              // 12% VIMATCH

// Recargos fijos por extras — antes solo se enseñaban como texto informativo
// en los ajustes y en la ventana de match, sin sumarse de verdad al precio.
export const PET_SURCHARGE = 2;              // €, mascota a bordo
export const CHILD_SEAT_SURCHARGE = 1;       // €, sistema de retención infantil
export const DOOR_TO_DOOR_SURCHARGE = 1.2;   // €, recogida exacta en la puerta

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
  /** Extras — cada uno añade su recargo fijo, de verdad, al precio final. */
  hasPet?: boolean;
  hasChildSeat?: boolean;
  isDoorToDoor?: boolean;
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
  /** Suma de recargos por mascota/silla infantil/puerta a puerta */
  extrasSurcharge: number;
  /** Traffic multiplier applied */
  trafficMultiplier: number;
}

/**
 * Calculate ride pricing using the VIMATCH cost-sharing formula.
 *
 * Example for 75km, 2 passengers, no detour, normal traffic:
 *   totalCost = 75 × 0.27 = 20.25€
 *   basePrice = 20.25 / 2.5 = 8.10€
 *   passengerPrice = 8.10 × 1.12 = 9.07€
 *   driverTotalIncome = 8.10 × 2 = 16.20€
 */
export function calculatePrice({
  distanceKm,
  passengerCount,
  detourKm = 0,
  traffic = 'normal',
  costPerKm,
  hasPet = false,
  hasChildSeat = false,
  isDoorToDoor = false,
}: PriceInput): PriceBreakdown {
  const factor = OCCUPANCY_FACTORS[passengerCount] ?? OCCUPANCY_FACTORS[1];
  const trafficMultiplier = TRAFFIC_MULTIPLIER[traffic];

  const costPerKmToUse = costPerKm ?? TOTAL_COST_PER_KM;
  const totalCost = distanceKm * costPerKmToUse;
  const detourSurcharge = detourKm * costPerKmToUse;

  // Recargos fijos — no dependen del tráfico ni se reparten por ocupación,
  // son un extra directo de este pasajero.
  const extrasSurcharge =
    (hasPet ? PET_SURCHARGE : 0) +
    (hasChildSeat ? CHILD_SEAT_SURCHARGE : 0) +
    (isDoorToDoor ? DOOR_TO_DOOR_SURCHARGE : 0);

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
