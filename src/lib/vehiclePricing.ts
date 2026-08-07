export type FuelType = 'gasoline' | 'diesel' | 'hybrid' | 'electric';
export type VehicleCategory = 'small' | 'medium' | 'large' | 'suv' | 'electric';
export type VerificationStatus = 'unverified' | 'pending' | 'verified';

export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  licensePlate: string;
  fuelType: FuelType;
  category: VehicleCategory;
  estimatedConsumption: number;
  costPerKm: number;
  verificationStatus: VerificationStatus;
  isActive: boolean;
  createdAt: string;
}

const SMALL_KEYWORDS = ['ibiza','polo','fiesta','micra','aygo','208','corsa','clio','yaris','500','up','mii','citigo','spark','picanto'];
const SUV_KEYWORDS = ['tiguan','qashqai','rav4','crv','x5','discovery','kodiaq','tucson','kuga','sportage','cx-5','forester','outback','t-roc','arona'];
const ELECTRIC_KEYWORDS = ['zoe','leaf','model 3','id.3','id3','e-208','ioniq','e-tron','etron','tesla','bz4x','enyaq'];
const DIESEL_KEYWORDS = ['tdi','hdi','cdti','bluehdi','dci','jtd','tdci','crd','d4d'];
const HYBRID_KEYWORDS = ['hybrid','prius','phev','e-hybrid','ehybrid','plugin'];

export function inferFuelType(model: string): FuelType {
  const m = model.toLowerCase();
  if (ELECTRIC_KEYWORDS.some(k => m.includes(k))) return 'electric';
  if (HYBRID_KEYWORDS.some(k => m.includes(k))) return 'hybrid';
  if (DIESEL_KEYWORDS.some(k => m.includes(k))) return 'diesel';
  return 'gasoline';
}

export function inferVehicleCategory(model: string): VehicleCategory {
  const m = model.toLowerCase();
  if (ELECTRIC_KEYWORDS.some(k => m.includes(k))) return 'electric';
  if (SUV_KEYWORDS.some(k => m.includes(k))) return 'suv';
  if (SMALL_KEYWORDS.some(k => m.includes(k))) return 'small';
  return 'medium';
}

const FUEL_PRICE: Record<FuelType, number> = { gasoline: 1.65, diesel: 1.55, hybrid: 1.65, electric: 0 };
const MAINTENANCE = 0.10;

const BASE_CONSUMPTION: Record<VehicleCategory, Record<FuelType, number>> = {
  small:    { gasoline: 5.5,  diesel: 4.2,  hybrid: 3.8,  electric: 0 },
  medium:   { gasoline: 6.5,  diesel: 5.0,  hybrid: 4.5,  electric: 0 },
  large:    { gasoline: 8.0,  diesel: 6.5,  hybrid: 5.5,  electric: 0 },
  suv:      { gasoline: 8.5,  diesel: 7.0,  hybrid: 6.0,  electric: 0 },
  electric: { gasoline: 0,    diesel: 0,    hybrid: 0,    electric: 0 },
};

export const FUEL_LABELS: Record<FuelType, string> = {
  gasoline: 'Gasolina',
  diesel: 'Diésel',
  hybrid: 'Híbrido',
  electric: 'Eléctrico',
};

export const CATEGORY_LABELS: Record<VehicleCategory, string> = {
  small: 'Utilitario',
  medium: 'Compacto',
  large: 'Berlina',
  suv: 'SUV',
  electric: 'Eléctrico',
};

export function calculateCostPerKm(
  category: VehicleCategory,
  fuelType: FuelType,
  isVerified: boolean
): number {
  if (fuelType === 'electric' || category === 'electric') {
    const base = (isVerified ? 0.04 : 0.046) + MAINTENANCE;
    return Math.round(base * 1000) / 1000;
  }
  const consumption = BASE_CONSUMPTION[category][fuelType] * (isVerified ? 1 : 1.15);
  const fuelCost = (consumption / 100) * FUEL_PRICE[fuelType];
  return Math.round((fuelCost + MAINTENANCE) * 1000) / 1000;
}

export function buildVehicle(
  brand: string, model: string, year: number, licensePlate: string
): Omit<Vehicle, 'id' | 'createdAt'> {
  const fuelType = inferFuelType(model);
  const category = inferVehicleCategory(model);
  const costPerKm = calculateCostPerKm(category, fuelType, false);
  const consumption = BASE_CONSUMPTION[category][fuelType];
  return {
    brand, model, year, licensePlate,
    fuelType, category,
    estimatedConsumption: consumption,
    costPerKm,
    verificationStatus: 'unverified',
    isActive: true,
  };
}
