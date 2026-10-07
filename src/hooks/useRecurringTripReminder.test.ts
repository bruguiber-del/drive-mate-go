import { describe, it, expect } from "vitest";
import { isTripDueNow } from "./useRecurringTripReminder";

const mon0800 = { active: true, daysOfWeek: [1], departureTime: "08:00" };

function at(hour: number, minute: number, weekday = 1): Date {
  // 2026-01-05 es lunes — se fija un día conocido para controlar getDay().
  const d = new Date(2026, 0, 5 + (weekday - 1), hour, minute);
  return d;
}

describe("isTripDueNow", () => {
  it("is due inside the 30-minute-before window", () => {
    expect(isTripDueNow(mon0800, at(7, 45))).toBe(true);
  });

  it("is due right at departure time", () => {
    expect(isTripDueNow(mon0800, at(8, 0))).toBe(true);
  });

  it("is due inside the 15-minute-after window", () => {
    expect(isTripDueNow(mon0800, at(8, 10))).toBe(true);
  });

  it("is not due far before departure", () => {
    expect(isTripDueNow(mon0800, at(7, 0))).toBe(false);
  });

  it("is not due well after departure", () => {
    expect(isTripDueNow(mon0800, at(8, 30))).toBe(false);
  });

  it("is not due on a day not selected", () => {
    expect(isTripDueNow(mon0800, at(8, 0, 2))).toBe(false);
  });

  it("is never due when inactive", () => {
    expect(isTripDueNow({ ...mon0800, active: false }, at(8, 0))).toBe(false);
  });
});
