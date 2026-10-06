import { describe, it, expect } from "vitest";
import { buildPassengerStopPills } from "./passengerStopPills";

describe("buildPassengerStopPills", () => {
  it("gives each passenger the ETA of their pickup and dropoff stops", () => {
    const pills = buildPassengerStopPills(
      [{ passenger: { id: "a", name: "Ana" }, status: "waiting_pickup" }],
      [
        { kind: "pickup", lat: 0, lng: 0, passengerIds: ["a"], label: "Ana" } as any,
        { kind: "dropoff", lat: 0, lng: 1, passengerIds: ["a"], label: "Ana" } as any,
      ],
      [4, 11],
    );
    expect(pills).toEqual([
      { key: "a", passengerId: "a", name: "Ana", status: "waiting_pickup", pickupEtaMin: 4, dropoffEtaMin: 11 },
    ]);
  });

  it("leaves ETAs undefined when the stop is not in the route", () => {
    const pills = buildPassengerStopPills([{ passenger: { id: "b", name: "Luis" }, status: "in_car" }], [], []);
    expect(pills[0].pickupEtaMin).toBeUndefined();
    expect(pills[0].dropoffEtaMin).toBeUndefined();
  });
});
