import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useWaypoints } from "./useWaypoints";

const pickup = { lat: 40.4, lng: -3.7, name: "Recogida" };
const dropoff = { lat: 40.5, lng: -3.6, name: "Bajada" };
const finalDest = { lat: 40.6, lng: -3.5, name: "Destino final" };

describe("useWaypoints", () => {
  it("starts empty and heading to the final destination", () => {
    const { result } = renderHook(() => useWaypoints());
    expect(result.current.waypoints).toHaveLength(0);
    expect(result.current.currentLeg).toBe("to_destination");
    expect(result.current.hasPassenger).toBe(false);
  });

  it("walks the full door-to-door phase transitions", () => {
    const { result } = renderHook(() => useWaypoints());

    act(() => result.current.setFinalDestination(finalDest));
    act(() => result.current.addPassengerWaypoints(pickup, dropoff));

    expect(result.current.currentLeg).toBe("to_pickup");
    expect(result.current.hasPassenger).toBe(true);
    expect(result.current.currentTarget?.type).toBe("pickup");
    expect(result.current.waypoints.map((w) => w.type)).toEqual([
      "pickup",
      "dropoff",
      "final_destination",
    ]);

    act(() => result.current.confirmPickup());
    expect(result.current.currentLeg).toBe("to_dropoff");
    expect(result.current.currentTarget?.type).toBe("dropoff");

    act(() => result.current.confirmDropoff());
    expect(result.current.currentLeg).toBe("to_destination");
    expect(result.current.hasPassenger).toBe(false);
    expect(result.current.currentTarget?.type).toBe("final_destination");
    expect(result.current.routeWaypoints).toHaveLength(1);
  });

  it("uses the meeting-point leg when there is no door-to-door", () => {
    const { result } = renderHook(() => useWaypoints());

    act(() => result.current.addMeetingPointWaypoints(pickup, dropoff));
    expect(result.current.currentLeg).toBe("to_meeting_point");
    expect(result.current.currentTarget?.type).toBe("pickup");

    act(() => result.current.confirmMeetingPointArrival());
    expect(result.current.currentLeg).toBe("to_dropoff");
    expect(result.current.currentTarget?.name).toBe("Bajada");
  });

  it("clears all state on completeTrip", () => {
    const { result } = renderHook(() => useWaypoints());
    act(() => result.current.setFinalDestination(finalDest));
    act(() => result.current.addPassengerWaypoints(pickup, dropoff));

    act(() => result.current.completeTrip());
    expect(result.current.waypoints).toHaveLength(0);
    expect(result.current.routeWaypoints).toHaveLength(0);
    expect(result.current.currentLeg).toBe("to_destination");
    expect(result.current.hasPassenger).toBe(false);
    expect(result.current.currentTarget).toBeNull();
  });

  it("clears all state on cancelTrip", () => {
    const { result } = renderHook(() => useWaypoints());
    act(() => result.current.addMeetingPointWaypoints(pickup, dropoff));

    act(() => result.current.cancelTrip());
    expect(result.current.waypoints).toHaveLength(0);
    expect(result.current.currentLeg).toBe("to_destination");
    expect(result.current.hasPassenger).toBe(false);
  });
});
