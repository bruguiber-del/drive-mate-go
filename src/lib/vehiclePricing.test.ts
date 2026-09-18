import { describe, it, expect } from "vitest";
import {
  inferFuelType,
  inferVehicleCategory,
  calculateCostPerKm,
  buildVehicle,
} from "./vehiclePricing";

describe("inferFuelType", () => {
  it("detects electric models", () => {
    expect(inferFuelType("Model 3")).toBe("electric");
    expect(inferFuelType("ID.3")).toBe("electric");
  });
  it("detects hybrid models", () => {
    expect(inferFuelType("Prius")).toBe("hybrid");
    expect(inferFuelType("Tucson PHEV")).toBe("hybrid");
  });
  it("detects diesel models", () => {
    expect(inferFuelType("Golf TDI")).toBe("diesel");
    expect(inferFuelType("308 BlueHDi")).toBe("diesel");
  });
  it("falls back to gasoline", () => {
    expect(inferFuelType("Corolla")).toBe("gasoline");
  });
});

describe("inferVehicleCategory", () => {
  it("prioritises electric over other keywords", () => {
    expect(inferVehicleCategory("Ioniq")).toBe("electric");
  });
  it("detects SUVs and small cars", () => {
    expect(inferVehicleCategory("Qashqai")).toBe("suv");
    expect(inferVehicleCategory("Ibiza")).toBe("small");
  });
  it("defaults to medium", () => {
    expect(inferVehicleCategory("Mondeo")).toBe("medium");
  });
});

describe("calculateCostPerKm", () => {
  it("penalises unverified vehicles", () => {
    const verified = calculateCostPerKm("medium", "gasoline", true);
    const unverified = calculateCostPerKm("medium", "gasoline", false);
    expect(unverified).toBeGreaterThan(verified);
    expect(unverified).toBeCloseTo(verified + (6.5 * 0.15 / 100) * 1.65, 3);
  });

  it("computes the gasoline compact reference value", () => {
    expect(calculateCostPerKm("medium", "gasoline", true)).toBeCloseTo(0.207, 3);
  });

  it("uses a flat electric rate plus maintenance", () => {
    expect(calculateCostPerKm("electric", "electric", true)).toBeCloseTo(0.14, 3);
    expect(calculateCostPerKm("electric", "electric", false)).toBeCloseTo(0.146, 3);
  });

  it("makes diesel cheaper per km than gasoline in the same category", () => {
    expect(calculateCostPerKm("suv", "diesel", true)).toBeLessThan(
      calculateCostPerKm("suv", "gasoline", true),
    );
  });
});

describe("buildVehicle", () => {
  it("infers fuel, category and unverified cost", () => {
    const v = buildVehicle("Seat", "Ibiza TDI", 2019, "1234ABC");
    expect(v.fuelType).toBe("diesel");
    expect(v.category).toBe("small");
    expect(v.verificationStatus).toBe("unverified");
    expect(v.isActive).toBe(true);
    expect(v.costPerKm).toBeCloseTo(calculateCostPerKm("small", "diesel", false), 3);
    expect(v.estimatedConsumption).toBe(4.2);
  });
});
