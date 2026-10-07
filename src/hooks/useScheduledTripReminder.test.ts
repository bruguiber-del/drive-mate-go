import { describe, it, expect } from "vitest";
import { isScheduledTripDueNow } from "./useScheduledTripReminder";

function iso(base: Date, minutesOffset: number): string {
  return new Date(base.getTime() + minutesOffset * 60_000).toISOString();
}

describe("isScheduledTripDueNow", () => {
  const now = new Date("2026-01-05T08:00:00.000Z");

  it("is due inside the 30-minute-before window", () => {
    expect(isScheduledTripDueNow({ scheduledAt: iso(now, 25) }, now)).toBe(true);
  });

  it("is due right at departure time", () => {
    expect(isScheduledTripDueNow({ scheduledAt: iso(now, 0) }, now)).toBe(true);
  });

  it("is due inside the 15-minute-after window", () => {
    expect(isScheduledTripDueNow({ scheduledAt: iso(now, -10) }, now)).toBe(true);
  });

  it("is not due far before departure", () => {
    expect(isScheduledTripDueNow({ scheduledAt: iso(now, 45) }, now)).toBe(false);
  });

  it("is not due well after departure", () => {
    expect(isScheduledTripDueNow({ scheduledAt: iso(now, -30) }, now)).toBe(false);
  });

  it("is not due for a different day", () => {
    expect(isScheduledTripDueNow({ scheduledAt: iso(now, 60 * 24) }, now)).toBe(false);
  });
});
