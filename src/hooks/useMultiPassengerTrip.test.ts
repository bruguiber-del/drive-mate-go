import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMultiPassengerTrip } from "./useMultiPassengerTrip";
import type { SimulatedPassenger } from "./usePassengerSimulation";
import { COMMISSION } from "@/lib/priceCalculator";

// compensation (= driverIncome) es tripShare ya descontada la mitad de la
// comisión que paga el conductor por este pasajero: tripShare × (1 - 6%).
const netFactor = 1 - COMMISSION / 2;

function makePassenger(id: string, overrides: Partial<SimulatedPassenger> = {}): SimulatedPassenger {
  return {
    id,
    name: id,
    gender: "women",
    rating: 4.8,
    origin: { lat: 0, lng: 1, name: `${id} origin` },
    destination: { lat: 0, lng: 5, name: `${id} destination` },
    detourMinutes: 3,
    detourKm: 1,
    tripDistanceKm: 4,
    routeTotalDurationS: 600,
    pickupDistance: "500m",
    compensation: 2,
    acceptsPets: false,
    hasChildSeat: false,
    doorToDoor: false,
    costPerKm: 0.226,
    receipt: {
      passengerPrice: 2.24,
      totalCost: 4,
      occupants: 2,
      tripShare: 2,
      detourCharge: 0,
      extrasSurcharge: 0,
      commissionAmount: 0.24,
      driverCommissionShare: 0.1,
    },
    ...overrides,
  };
}

describe("useMultiPassengerTrip", () => {
  it("starts empty with all seats free", () => {
    const { result } = renderHook(() => useMultiPassengerTrip({ seats: 3 }));
    expect(result.current.passengers).toHaveLength(0);
    expect(result.current.freeSeats).toBe(3);
  });

  it("reserves a seat immediately on accept, not only once physically picked up", () => {
    const { result } = renderHook(() => useMultiPassengerTrip({ seats: 3 }));
    act(() => result.current.acceptPassenger(makePassenger("p1")));
    expect(result.current.freeSeats).toBe(2);
    expect(result.current.passengers[0].status).toBe("waiting_pickup");
  });

  it("never accepts more passengers than there are seats", () => {
    const { result } = renderHook(() => useMultiPassengerTrip({ seats: 1 }));
    act(() => result.current.acceptPassenger(makePassenger("p1")));
    act(() => result.current.acceptPassenger(makePassenger("p2")));
    expect(result.current.passengers.map((p) => p.passenger.id)).toEqual(["p1"]);
    expect(result.current.freeSeats).toBe(0);
  });

  it("frees the seat the instant a dropoff is confirmed — not at trip end", () => {
    const { result } = renderHook(() => useMultiPassengerTrip({ seats: 1 }));
    act(() => result.current.acceptPassenger(makePassenger("p1")));
    act(() => result.current.confirmPickup(["p1"]));
    expect(result.current.freeSeats).toBe(0);

    act(() => result.current.confirmDropoff(["p1"]));
    expect(result.current.freeSeats).toBe(1);
    expect(result.current.passengers).toHaveLength(0);
  });

  it("lets a new passenger be accepted right after a seat frees up mid-trip", () => {
    const { result } = renderHook(() => useMultiPassengerTrip({ seats: 1 }));
    act(() => result.current.acceptPassenger(makePassenger("p1")));
    act(() => result.current.confirmPickup(["p1"]));
    act(() => result.current.confirmDropoff(["p1"]));
    act(() => result.current.acceptPassenger(makePassenger("p2")));
    expect(result.current.passengers.map((p) => p.passenger.id)).toEqual(["p2"]);
  });

  it("orders remaining stops with pickups only for those still waiting", () => {
    const { result } = renderHook(() => useMultiPassengerTrip({ seats: 2 }));
    act(() => {
      result.current.acceptPassenger(makePassenger("p1", { origin: { lat: 0, lng: 1, name: "p1 origin" }, destination: { lat: 0, lng: 8, name: "p1 dest" } }));
    });
    act(() => result.current.confirmPickup(["p1"])); // p1 ya en el coche, solo queda su bajada
    act(() => {
      result.current.acceptPassenger(makePassenger("p2", { origin: { lat: 0, lng: 2, name: "p2 origin" }, destination: { lat: 0, lng: 3, name: "p2 dest" } }));
    });

    const stops = result.current.stops({ lat: 0, lng: 0 });
    // p1 no debe tener parada de recogida (ya está a bordo) — solo bajada.
    const p1Stops = stops.filter((s) => s.passengerIds.includes("p1"));
    expect(p1Stops).toHaveLength(1);
    expect(p1Stops[0].kind).toBe("dropoff");
    // p2 sí necesita ambas.
    const p2Stops = stops.filter((s) => s.passengerIds.includes("p2"));
    expect(p2Stops.map((s) => s.kind).sort()).toEqual(["dropoff", "pickup"]);
  });

  it("recalculates every passenger's price when someone new joins — the reparto depends on live occupancy", () => {
    const { result } = renderHook(() => useMultiPassengerTrip({ seats: 3 }));
    act(() => result.current.acceptPassenger(makePassenger("p1", { tripDistanceKm: 10, detourKm: 0, costPerKm: 0.26 })));
    // Solo: factor = 1 pasajero + 1 conductor = 2
    expect(result.current.passengers[0].passenger.compensation).toBeCloseTo(((10 * 0.26) / 2) * netFactor, 2);

    act(() => result.current.acceptPassenger(makePassenger("p2", { tripDistanceKm: 5, detourKm: 0, costPerKm: 0.26 })));
    // Ahora van 2 pasajeros: factor = 2 + 1 = 3 — p1 se recalcula, no se queda con el precio de cuando iba solo.
    const p1 = result.current.passengers.find((p) => p.passenger.id === "p1")!.passenger;
    expect(p1.compensation).toBeCloseTo(((10 * 0.26) / 3) * netFactor, 2);
  });

  it("recalculates the remaining passengers' price after a dropoff frees a seat", () => {
    const { result } = renderHook(() => useMultiPassengerTrip({ seats: 3 }));
    act(() => result.current.acceptPassenger(makePassenger("p1", { tripDistanceKm: 10, detourKm: 0, costPerKm: 0.26 })));
    act(() => result.current.acceptPassenger(makePassenger("p2", { tripDistanceKm: 5, detourKm: 0, costPerKm: 0.26 })));
    const beforeDropoff = result.current.passengers.find((p) => p.passenger.id === "p1")!.passenger.compensation;

    act(() => result.current.confirmDropoff(["p2"]));
    const afterDropoff = result.current.passengers.find((p) => p.passenger.id === "p1")!.passenger.compensation;
    // Con menos gente compartiendo, a p1 le toca pagar/cobrar una porción mayor.
    expect(afterDropoff).toBeGreaterThan(beforeDropoff);
    expect(afterDropoff).toBeCloseTo(((10 * 0.26) / 2) * netFactor, 2);
  });
});
