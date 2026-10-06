import { describe, it, expect } from "vitest";
import { calculatePrice, COMMISSION, PET_SURCHARGE, CHILD_SEAT_SURCHARGE } from "./priceCalculator";

describe("calculatePrice cost sharing", () => {
  it("adds the commission on top of the driver's base for the passenger", () => {
    const p = calculatePrice({ distanceKm: 10, passengerCount: 2 });
    expect(p.passengerPrice).toBeCloseTo(p.basePrice * (1 + COMMISSION), 1);
    expect(p.driverIncome).toBe(p.basePrice);
  });

  it("splits the cost among more passengers", () => {
    const one = calculatePrice({ distanceKm: 10, passengerCount: 1 });
    const four = calculatePrice({ distanceKm: 10, passengerCount: 4 });
    expect(four.basePrice).toBeLessThan(one.basePrice);
  });

  it("charges fixed extras on top of the base, not split by occupancy", () => {
    const plain = calculatePrice({ distanceKm: 10, passengerCount: 2 });
    const extras = calculatePrice({ distanceKm: 10, passengerCount: 2, hasPet: true, hasChildSeat: true });
    expect(extras.basePrice - plain.basePrice).toBeCloseTo(PET_SURCHARGE + CHILD_SEAT_SURCHARGE, 1);
  });

  it("increases with the real detour distance", () => {
    const none = calculatePrice({ distanceKm: 10, passengerCount: 2, detourKm: 0 });
    const some = calculatePrice({ distanceKm: 10, passengerCount: 2, detourKm: 3 });
    expect(some.basePrice).toBeGreaterThan(none.basePrice);
  });
});
