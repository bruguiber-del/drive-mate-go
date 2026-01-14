// Price calculation service for Vimatch
// Ensures cost-sharing compliance (never profit, just shared expenses)

export interface TripPricing {
  basePrice: number;        // Base price from distance/fuel
  petSurcharge: number;     // +2€ if pets accepted
  childSeatSurcharge: number; // +1€ if child seat needed
  doorToDoorSurcharge: number; // Calculated based on extra km/time
  spaceSurcharge: number;   // +0.50€ or +1€ for space preference
  totalPerPassenger: number;
  totalTrip: number;
  legalMaximum: number;     // Maximum allowed for cost-sharing compliance
  isCapped: boolean;        // True if total was reduced to legal maximum
  driverCompensation: number; // After 15% commission
}

export interface TripDetails {
  distanceKm: number;
  estimatedMinutes: number;
  passengerCount: number;
  acceptsPets?: boolean;
  needsChildSeat?: boolean;
  doorToDoor?: boolean;
  doorToDoorExtraKm?: number;
  spacePreference?: 'none' | 'spacious-car' | 'spacious-front';
  region?: string; // Comunidad autónoma
}

// Average fuel costs per region (€/km estimated)
const FUEL_COST_PER_KM: Record<string, number> = {
  'aragon': 0.12,
  'cataluña': 0.13,
  'madrid': 0.11,
  'andalucia': 0.11,
  'valencia': 0.12,
  'default': 0.12,
};

// Commission rate
const PLATFORM_COMMISSION = 0.15;

// Surcharges
const PET_SURCHARGE = 2.00;
const CHILD_SEAT_SURCHARGE = 1.00;
const SPACE_SURCHARGES = {
  'none': 0,
  'spacious-car': 0.50,
  'spacious-front': 1.00,
};

export function calculateTripPrice(details: TripDetails): TripPricing {
  const {
    distanceKm,
    estimatedMinutes,
    passengerCount,
    acceptsPets = false,
    needsChildSeat = false,
    doorToDoor = false,
    doorToDoorExtraKm = 0,
    spacePreference = 'none',
    region = 'default',
  } = details;

  // Get fuel cost for region
  const fuelCostPerKm = FUEL_COST_PER_KM[region.toLowerCase()] || FUEL_COST_PER_KM.default;

  // Calculate base price (distance + time factor)
  const totalDistance = distanceKm + doorToDoorExtraKm;
  const baseFuelCost = totalDistance * fuelCostPerKm;
  const timeFactor = estimatedMinutes * 0.02; // Small time-based factor
  const basePrice = Math.max(2, baseFuelCost + timeFactor); // Minimum 2€

  // Calculate surcharges
  const petSurcharge = acceptsPets ? PET_SURCHARGE : 0;
  const childSeatSurcharge = needsChildSeat ? CHILD_SEAT_SURCHARGE : 0;
  const spaceSurcharge = SPACE_SURCHARGES[spacePreference] || 0;

  // Door to door surcharge (based on extra distance)
  const doorToDoorSurcharge = doorToDoor 
    ? Math.max(0.50, doorToDoorExtraKm * fuelCostPerKm * 2 + (doorToDoorExtraKm * 0.10)) 
    : 0;

  // Total before legal cap
  const subtotal = basePrice + petSurcharge + childSeatSurcharge + doorToDoorSurcharge + spaceSurcharge;

  // Calculate legal maximum (estimated real trip cost)
  // This ensures cost-sharing, not profit
  const estimatedRealCost = totalDistance * fuelCostPerKm * 1.5 + 2; // 1.5x for wear and tear
  const legalMaximum = Math.max(estimatedRealCost, 5); // Minimum 5€ legal max

  // Apply legal cap if needed
  const isCapped = subtotal > legalMaximum;
  const totalTrip = isCapped ? legalMaximum : subtotal;

  // Per passenger (divided by number of passengers)
  const effectivePassengers = Math.max(1, passengerCount);
  const totalPerPassenger = totalTrip / effectivePassengers;

  // Driver compensation (after 15% commission)
  const driverCompensation = totalTrip * (1 - PLATFORM_COMMISSION);

  return {
    basePrice: Math.round(basePrice * 100) / 100,
    petSurcharge,
    childSeatSurcharge,
    doorToDoorSurcharge: Math.round(doorToDoorSurcharge * 100) / 100,
    spaceSurcharge,
    totalPerPassenger: Math.round(totalPerPassenger * 100) / 100,
    totalTrip: Math.round(totalTrip * 100) / 100,
    legalMaximum: Math.round(legalMaximum * 100) / 100,
    isCapped,
    driverCompensation: Math.round(driverCompensation * 100) / 100,
  };
}

// Example: Huesca-Zaragoza (~72km, ~50min)
// Returns estimated price breakdown
export function getExamplePrice(): TripPricing {
  return calculateTripPrice({
    distanceKm: 72,
    estimatedMinutes: 50,
    passengerCount: 1,
    region: 'aragon',
  });
}
