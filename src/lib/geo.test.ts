import { describe, it, expect } from "vitest";
import { haversineKm, haversineMeters } from "./geo";

describe("geo", () => {
  it("measures one degree of longitude on the equator as about 111 km", () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.19, 1);
  });

  it("returns meters as kilometers times 1000", () => {
    expect(haversineMeters(0, 0, 0, 1)).toBeCloseTo(111190, -2);
  });

  it("is zero for the same point", () => {
    expect(haversineKm(40.4, -3.7, 40.4, -3.7)).toBe(0);
  });
});
