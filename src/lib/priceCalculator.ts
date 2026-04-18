// Price calculator for VIMATCH — cost-sharing model (no profit)
// Formula:
//   precio_por_pasajero = (coste_total / factor_ocupacion) × (1 + comision)

// ── Constants (fuel + maintenance) ───────────────────────────────────────────
export const FUEL_COST_PER_KM = 0.17;        // €/km (gasolina 1,65€, 6,5L/100km)
export const MAINTENANCE_PER_KM = 0.10;      // €/km (ruedas, seguro, etc.)
export const TOTAL_COST_PER_KM = FUEL_COST_PER_KM + MAINTENANCE_PER_KM; // 0.27 €/km
export const COMMISSION = 0.12;              // 12% VIMATCH

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
}: PriceInput): PriceBreakdown {
  const factor = OCCUPANCY_FACTORS[passengerCount] ?? OCCUPANCY_FACTORS[1];
  const trafficMultiplier = TRAFFIC_MULTIPLIER[traffic];

  const totalCost = distanceKm * TOTAL_COST_PER_KM;
  const detourSurcharge = detourKm * TOTAL_COST_PER_KM;

  // Base price per passenger before commission
  const basePrice = (totalCost / factor + detourSurcharge) * trafficMultiplier;
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
    trafficMultiplier,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
