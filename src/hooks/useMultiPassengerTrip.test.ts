import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMultiPassengerTrip } from "./useMultiPassengerTrip";
import type { SimulatedPassenger } from "./usePassengerSimulation";

function makePassenger(id: string, overrides: Partial<SimulatedPassenger> = {}): SimulatedPassenger {
  return {
    id,
    name: id,
    rating: 4.8,
    origin: { lat: 0, lng: 1, name: `${id} origin` },
    destination: { lat: 0, lng: 5, name: `${id} destination` },
    detourMinutes: 3,
    pickupDistance: "500m",
    compensation: 2,
    acceptsPets: false,
    hasChildSeat: false,
    doorToDoor: false,
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
});
