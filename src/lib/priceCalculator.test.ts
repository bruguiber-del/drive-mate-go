import { describe, it, expect } from "vitest";
import {
  calculatePrice,
  TOTAL_COST_PER_KM,
  COMMISSION,
  PET_SURCHARGE,
  CHILD_SEAT_SURCHARGE,
} from "./priceCalculator";

describe("calculatePrice", () => {
  it("applies the documented cost-sharing formula (split among driver + passengers)", () => {
    const r = calculatePrice({ distanceKm: 75, passengerCount: 2 });
    expect(r.totalCost).toBe(16.95);
    // factor = 2 pasajeros + 1 conductor = 3
    expect(r.basePrice).toBe(5.65);
    expect(r.passengerPrice).toBe(6.33);
    expect(r.driverGrossIncome).toBe(11.3);
    expect(r.driverCommissionShare).toBe(0.68);
    expect(r.driverTotalIncome).toBe(10.62);
    expect(r.totalCommission).toBe(2.03);
    expect(r.trafficMultiplier).toBe(1);
  });

  it("splits the 12% commission among every occupant, driver included — not just the passengers", () => {
    const r = calculatePrice({ distanceKm: 40, passengerCount: 3 });
    // El conductor paga su propia parte, igual que cada pasajero.
    expect(r.driverCommissionShare).toBeCloseTo(r.basePrice * COMMISSION, 2);
    // La comisión total del viaje es exactamente el 12% del coste real,
    // repartida entre los 3 pasajeros + el conductor.
    expect(r.totalCommission).toBeCloseTo(r.totalCost * COMMISSION, 2);
    expect(r.totalCommission).toBeCloseTo(r.commissionAmount * 3 + r.driverCommissionShare, 2);
    expect(r.driverTotalIncome).toBe(r.driverGrossIncome - r.driverCommissionShare);
  });

  it("does not make the driver pay commission on another passenger's own detour or extras", () => {
    const plain = calculatePrice({ distanceKm: 30, passengerCount: 2, costPerKm: 0.2 });
    const withDetourAndExtras = calculatePrice({
      distanceKm: 30,
      passengerCount: 2,
      detourKm: 4,
      hasPet: true,
      costPerKm: 0.2,
    });
    // El desvío y los extras son 100% de ese pasajero — no mueven la parte
    // de comisión del conductor, que solo depende del tramo compartido.
    expect(withDetourAndExtras.driverCommissionShare).toBeCloseTo(plain.driverCommissionShare, 2);
  });

  it("charges commission on top of the base price", () => {
    const r = calculatePrice({ distanceKm: 10, passengerCount: 1 });
    expect(r.commissionAmount).toBeCloseTo(r.basePrice * COMMISSION, 2);
    expect(r.passengerPrice).toBeCloseTo(r.basePrice + r.commissionAmount, 2);
    expect(r.driverIncome).toBe(r.basePrice);
  });

  it("divides the cost among the driver and all passengers (more passengers, lower price each)", () => {
    const one = calculatePrice({ distanceKm: 50, passengerCount: 1 });
    const two = calculatePrice({ distanceKm: 50, passengerCount: 2 });
    const four = calculatePrice({ distanceKm: 50, passengerCount: 4 });
    expect(two.passengerPrice).toBeLessThan(one.passengerPrice);
    expect(four.passengerPrice).toBeLessThan(two.passengerPrice);
    expect(one.totalCost).toBe(50 * TOTAL_COST_PER_KM);
    // factor = passengerCount + 1 (el conductor cuenta como uno más)
    expect(one.basePrice).toBeCloseTo((50 * TOTAL_COST_PER_KM) / 2, 2);
    expect(four.basePrice).toBeCloseTo((50 * TOTAL_COST_PER_KM) / 5, 2);
  });

  it("honours the optional costPerKm of the active vehicle", () => {
    const generic = calculatePrice({ distanceKm: 20, passengerCount: 1 });
    const cheap = calculatePrice({ distanceKm: 20, passengerCount: 1, costPerKm: 0.14 });
    expect(cheap.totalCost).toBe(2.8);
    expect(cheap.passengerPrice).toBeLessThan(generic.passengerPrice);
  });

  it("adds a detour surcharge based on the same cost per km", () => {
    const base = calculatePrice({ distanceKm: 30, passengerCount: 2, costPerKm: 0.2 });
    const detoured = calculatePrice({
      distanceKm: 30,
      passengerCount: 2,
      detourKm: 5,
      costPerKm: 0.2,
    });
    expect(detoured.detourSurcharge).toBe(1);
    expect(detoured.basePrice).toBeCloseTo(base.basePrice + 1, 2);
  });

  it("never bases the price on a cost per km above the legal reference (Orden HFP/792/2023, 0,26€/km)", () => {
    const overLimit = calculatePrice({ distanceKm: 20, passengerCount: 1, costPerKm: 0.5 });
    const atLimit = calculatePrice({ distanceKm: 20, passengerCount: 1, costPerKm: 0.26 });
    expect(overLimit.totalCost).toBe(atLimit.totalCost);
    expect(overLimit.totalCost).toBe(5.2);
  });

  it("a lone passenger pays half the real cost, not the full rate — the driver counts as one more", () => {
    const r = calculatePrice({ distanceKm: 10, passengerCount: 1, costPerKm: 0.26 });
    expect(r.totalCost).toBe(2.6);
    // factor = 1 pasajero + 1 conductor = 2
    expect(r.basePrice).toBe(1.3);
    expect(r.driverGrossIncome).toBe(1.3);
    expect(r.driverCommissionShare).toBe(0.16);
    expect(r.driverTotalIncome).toBe(1.14);
  });

  it("applies traffic multipliers", () => {
    const normal = calculatePrice({ distanceKm: 40, passengerCount: 2 });
    const rush = calculatePrice({ distanceKm: 40, passengerCount: 2, traffic: "rush" });
    expect(rush.trafficMultiplier).toBe(1.3);
    expect(rush.basePrice).toBeCloseTo(normal.basePrice * 1.3, 1);
  });

  it("adds real surcharges for pet and child seat — not just informational text", () => {
    const base = calculatePrice({ distanceKm: 20, passengerCount: 1 });
    const withExtras = calculatePrice({
      distanceKm: 20,
      passengerCount: 1,
      hasPet: true,
      hasChildSeat: true,
    });
    expect(withExtras.extrasSurcharge).toBe(PET_SURCHARGE + CHILD_SEAT_SURCHARGE);
    expect(withExtras.basePrice).toBeCloseTo(base.basePrice + withExtras.extrasSurcharge, 2);
    // La comisión se aplica también sobre los extras, no solo sobre el trayecto.
    expect(withExtras.passengerPrice).toBeCloseTo(withExtras.basePrice * (1 + COMMISSION), 2);
  });

  it("charges nothing extra when no extra is requested", () => {
    const r = calculatePrice({ distanceKm: 20, passengerCount: 1, hasPet: false, hasChildSeat: false });
    expect(r.extrasSurcharge).toBe(0);
  });

  it("door-to-door itself adds no fixed surcharge — only the real detour km it causes", () => {
    const withoutDoorToDoor = calculatePrice({ distanceKm: 20, passengerCount: 1, detourKm: 1.5, costPerKm: 0.2 });
    // No hay parámetro "isDoorToDoor": su único coste es el detourKm real,
    // que ya se cobra igual venga o no de una recogida puerta a puerta.
    expect(withoutDoorToDoor.extrasSurcharge).toBe(0);
    expect(withoutDoorToDoor.detourSurcharge).toBe(0.3);
  });
});
