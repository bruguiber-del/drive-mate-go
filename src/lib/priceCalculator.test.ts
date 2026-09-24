import { describe, it, expect } from "vitest";
import {
  calculatePrice,
  TOTAL_COST_PER_KM,
  COMMISSION,
  PET_SURCHARGE,
  CHILD_SEAT_SURCHARGE,
  DOOR_TO_DOOR_SURCHARGE,
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

  it("adds real surcharges for pet, child seat and door-to-door — not just informational text", () => {
    const base = calculatePrice({ distanceKm: 20, passengerCount: 1 });
    const withExtras = calculatePrice({
      distanceKm: 20,
      passengerCount: 1,
      hasPet: true,
      hasChildSeat: true,
      isDoorToDoor: true,
    });
    expect(withExtras.extrasSurcharge).toBe(PET_SURCHARGE + CHILD_SEAT_SURCHARGE + DOOR_TO_DOOR_SURCHARGE);
    expect(withExtras.basePrice).toBeCloseTo(base.basePrice + withExtras.extrasSurcharge, 2);
    // La comisión se aplica también sobre los extras, no solo sobre el trayecto.
    expect(withExtras.passengerPrice).toBeCloseTo(withExtras.basePrice * (1 + COMMISSION), 2);
  });

  it("charges nothing extra when no extra is requested", () => {
    const r = calculatePrice({ distanceKm: 20, passengerCount: 1, hasPet: false, hasChildSeat: false, isDoorToDoor: false });
    expect(r.extrasSurcharge).toBe(0);
  });
});
