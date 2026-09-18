import { useState, useCallback, useEffect, useRef } from 'react';
import { Vehicle, buildVehicle, calculateCostPerKm } from '@/lib/vehiclePricing';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'vimatch_vehicles';

type VehicleRow = {
  id: string;
  user_id: string;
  brand: string;
  model: string;
  year: number;
  license_plate: string;
  fuel_type: string;
  category: string;
  estimated_consumption: number;
  cost_per_km: number;
  verification_status: string;
  is_active: boolean;
  created_at: string;
};

function rowToVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    brand: row.brand,
    model: row.model,
    year: row.year,
    licensePlate: row.license_plate,
    fuelType: row.fuel_type as Vehicle['fuelType'],
    category: row.category as Vehicle['category'],
    estimatedConsumption: row.estimated_consumption,
    costPerKm: row.cost_per_km,
    verificationStatus: row.verification_status as Vehicle['verificationStatus'],
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function vehicleToRow(v: Vehicle, userId: string) {
  return {
    id: v.id,
    user_id: userId,
    brand: v.brand,
    model: v.model,
    year: v.year,
    license_plate: v.licensePlate,
    fuel_type: v.fuelType,
    category: v.category,
    estimated_consumption: v.estimatedConsumption,
    cost_per_km: v.costPerKm,
    verification_status: v.verificationStatus,
    is_active: v.isActive,
    created_at: v.createdAt,
  };
}

export function useVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  // Load from localStorage immediately (guest flow keeps working unchanged)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setVehicles(JSON.parse(stored));
    } catch {
      /* ignore corrupted storage */
    }
  }, []);

  // When signed in, Supabase becomes the source of truth
  useEffect(() => {
    let cancelled = false;

    const syncForUser = async (userId: string | null) => {
      userIdRef.current = userId;
      if (!userId) return;
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .order('created_at', { ascending: true });
      if (cancelled || error || !data) return;
      setVehicles(data.map((row) => rowToVehicle(row as VehicleRow)));
    };

    supabase.auth.getUser().then(({ data }) => syncForUser(data.user?.id ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      syncForUser(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
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

    const userId = userIdRef.current;
    if (userId) {
      supabase.from('vehicles').insert(vehicleToRow(vehicle, userId)).then(({ error }) => {
        if (error) console.error('No se pudo guardar el vehículo en la nube:', error.message);
      });
    }
    return vehicle;
  }, [vehicles, save]);

  const removeVehicle = useCallback((id: string) => {
    save(vehicles.filter(v => v.id !== id));
    if (activeVehicleId === id) setActiveVehicleId(null);

    if (userIdRef.current) {
      supabase.from('vehicles').delete().eq('id', id).then(({ error }) => {
        if (error) console.error('No se pudo borrar el vehículo en la nube:', error.message);
      });
    }
  }, [vehicles, save, activeVehicleId]);

  const startVerification = useCallback((id: string) => {
    const updated = vehicles.map(v =>
      v.id === id ? { ...v, verificationStatus: 'pending' as const } : v
    );
    save(updated);
    if (userIdRef.current) {
      supabase.from('vehicles').update({ verification_status: 'pending' }).eq('id', id).then(() => {});
    }

    setTimeout(() => {
      const target = updated.find(v => v.id === id);
      const newCost = target
        ? calculateCostPerKm(target.category, target.fuelType, true)
        : undefined;

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

      if (userIdRef.current && newCost !== undefined) {
        supabase
          .from('vehicles')
          .update({ verification_status: 'verified', cost_per_km: newCost })
          .eq('id', id)
          .then(() => {});
      }
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
