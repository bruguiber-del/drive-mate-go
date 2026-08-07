import { useState, useCallback, useEffect } from 'react';
import { Vehicle, buildVehicle, calculateCostPerKm } from '@/lib/vehiclePricing';

const STORAGE_KEY = 'vimatch_vehicles';

export function useVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setVehicles(JSON.parse(stored));
    } catch {
      /* ignore corrupted storage */
    }
  }, []);

  const save = useCallback((vList: Vehicle[]) => {
    setVehicles(vList);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vList));
  }, []);

  const addVehicle = useCallback((
    brand: string, model: string, year: number, licensePlate: string
  ) => {
    const partial = buildVehicle(brand, model, year, licensePlate);
    const vehicle: Vehicle = {
      ...partial,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    save([...vehicles, vehicle]);
    return vehicle;
  }, [vehicles, save]);

  const removeVehicle = useCallback((id: string) => {
    save(vehicles.filter(v => v.id !== id));
    if (activeVehicleId === id) setActiveVehicleId(null);
  }, [vehicles, save, activeVehicleId]);

  const startVerification = useCallback((id: string) => {
    const updated = vehicles.map(v =>
      v.id === id ? { ...v, verificationStatus: 'pending' as const } : v
    );
    save(updated);
    setTimeout(() => {
      const verified = updated.map(v =>
        v.id === id
          ? {
              ...v,
              verificationStatus: 'verified' as const,
              costPerKm: calculateCostPerKm(v.category, v.fuelType, true),
            }
          : v
      );
      save(verified);
    }, 5000);
  }, [vehicles, save]);

  const selectActiveVehicle = useCallback((id: string) => {
    setActiveVehicleId(id);
  }, []);

  const activeVehicle = vehicles.find(v => v.id === activeVehicleId) ?? null;

  return {
    vehicles,
    activeVehicle,
    activeVehicleId,
    addVehicle,
    removeVehicle,
    startVerification,
    selectActiveVehicle,
  };
}
