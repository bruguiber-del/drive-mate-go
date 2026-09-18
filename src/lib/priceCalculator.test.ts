import { describe, it, expect } from "vitest";
import {
  calculatePrice,
  TOTAL_COST_PER_KM,
  COMMISSION,
} from "./priceCalculator";

describe("calculatePrice", () => {
  it("applies the documented cost-sharing formula", () => {
    const r = calculatePrice({ distanceKm: 75, passengerCount: 2 });
    expect(r.totalCost).toBe(20.25);
    expect(r.basePrice).toBe(8.1);
    expect(r.passengerPrice).toBe(9.07);
    expect(r.driverTotalIncome).toBe(16.2);
    expect(r.trafficMultiplier).toBe(1);
  });

  it("charges commission on top of the base price", () => {
    const r = calculatePrice({ distanceKm: 10, passengerCount: 1 });
    expect(r.commissionAmount).toBeCloseTo(r.basePrice * COMMISSION, 2);
    expect(r.passengerPrice).toBeCloseTo(r.basePrice + r.commissionAmount, 2);
    expect(r.driverIncome).toBe(r.basePrice);
  });

  it("uses non-linear occupancy factors (more seats, lower price each)", () => {
    const one = calculatePrice({ distanceKm: 50, passengerCount: 1 });
    const two = calculatePrice({ distanceKm: 50, passengerCount: 2 });
    const four = calculatePrice({ distanceKm: 50, passengerCount: 4 });
    expect(two.passengerPrice).toBeLessThan(one.passengerPrice);
    expect(four.passengerPrice).toBeLessThan(two.passengerPrice);
    expect(one.totalCost).toBe(50 * TOTAL_COST_PER_KM);
  });

  it("honours the optional costPerKm of the active vehicle", () => {
    const generic = calculatePrice({ distanceKm: 20, passengerCount: 1 });
    const cheap = calculatePrice({ distanceKm: 20, passengerCount: 1, costPerKm: 0.14 });
    expect(cheap.totalCost).toBe(2.8);
    expect(cheap.passengerPrice).toBeLessThan(generic.passengerPrice);
  });

  it("adds a detour surcharge based on the same cost per km", () => {
    const base = calculatePrice({ distanceKm: 30, passengerCount: 2, costPerKm: 0.3 });
    const detoured = calculatePrice({
      distanceKm: 30,
      passengerCount: 2,
      detourKm: 5,
      costPerKm: 0.3,
    });
    expect(detoured.detourSurcharge).toBe(1.5);
    expect(detoured.basePrice).toBeCloseTo(base.basePrice + 1.5, 2);
  });

  it("applies traffic multipliers", () => {
    const normal = calculatePrice({ distanceKm: 40, passengerCount: 2 });
    const rush = calculatePrice({ distanceKm: 40, passengerCount: 2, traffic: "rush" });
    expect(rush.trafficMultiplier).toBe(1.3);
    expect(rush.basePrice).toBeCloseTo(normal.basePrice * 1.3, 1);
  });
});
