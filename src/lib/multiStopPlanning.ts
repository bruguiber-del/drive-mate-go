// Pure planning logic for driving multiple passengers in one trip: groups
// pickups/dropoffs that are close enough to share a single stop, then finds
// the visiting order that minimizes total distance while respecting that no
// passenger can be dropped off before being picked up.
//
// Kept as plain, dependency-free functions (no React, no Mapbox) so the
// logic itself — the part most likely to have a subtle bug — can be fully
// unit tested without a live map or a running app.

import { approxMetersBetween } from './mapGeo';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PassengerRequest {
  id: string;
  name: string;
  pickup: LatLng;
  dropoff: LatLng;
}

export type StopKind = 'pickup' | 'dropoff';

export interface PlannedStop extends LatLng {
  kind: StopKind;
  /** Passenger ids sharing this stop — more than one when combined. */
  passengerIds: string[];
  /** Passenger name(s) for display, joined with " + " when combined. */
  label: string;
}

/** Default distance (m) within which two same-kind stops are treated as one. */
export const DEFAULT_CLUSTER_DISTANCE_M = 180;

/**
 * Groups pickups with nearby pickups, and dropoffs with nearby dropoffs
 * (never a pickup with a dropoff), so two passengers who live on the same
 * corner share a single stop instead of two almost-identical ones.
 *
 * Each cluster's location is the average of the points it contains, so it
 * sits sensibly between the passengers sharing it rather than exactly on
 * top of whichever one happened to be processed first.
 */
export function clusterNearbyStops(
  passengers: PassengerRequest[],
  thresholdM: number = DEFAULT_CLUSTER_DISTANCE_M,
): PlannedStop[] {
  type RawStop = { kind: StopKind; point: LatLng; passengerId: string; passengerName: string };
  const raw: RawStop[] = [];
  for (const p of passengers) {
    raw.push({ kind: 'pickup', point: p.pickup, passengerId: p.id, passengerName: p.name });
    raw.push({ kind: 'dropoff', point: p.dropoff, passengerId: p.id, passengerName: p.name });
  }

  const clusters: Array<PlannedStop & { points: LatLng[] }> = [];

  for (const stop of raw) {
    const existing = clusters.find(
      (c) =>
        c.kind === stop.kind &&
        approxMetersBetween([c.lat, c.lng], [stop.point.lat, stop.point.lng]) <= thresholdM,
    );

    if (existing) {
      existing.passengerIds.push(stop.passengerId);
      existing.label += ` + ${stop.passengerName}`;
      existing.points.push(stop.point);
      const n = existing.points.length;
      existing.lat = existing.points.reduce((s, p) => s + p.lat, 0) / n;
      existing.lng = existing.points.reduce((s, p) => s + p.lng, 0) / n;
    } else {
      clusters.push({
        kind: stop.kind,
        lat: stop.point.lat,
        lng: stop.point.lng,
        passengerIds: [stop.passengerId],
        label: stop.passengerName,
        points: [stop.point],
      });
    }
  }

  return clusters.map(({ points, ...stop }) => stop);
}

/**
 * Same merge as clusterNearbyStops, but starting from already-built stops
 * instead of full pickup+dropoff pairs — needed once a trip is under way and
 * some passengers are already in the car (only their dropoff is still
 * pending, there's no pickup left to plan for them).
 */
export function clusterPlannedStops(
  stops: Array<{ kind: StopKind; lat: number; lng: number; passengerId: string; passengerName: string }>,
  thresholdM: number = DEFAULT_CLUSTER_DISTANCE_M,
): PlannedStop[] {
  const clusters: Array<PlannedStop & { points: LatLng[] }> = [];

  for (const stop of stops) {
    const existing = clusters.find(
      (c) => c.kind === stop.kind && approxMetersBetween([c.lat, c.lng], [stop.lat, stop.lng]) <= thresholdM,
    );

    if (existing) {
      existing.passengerIds.push(stop.passengerId);
      existing.label += ` + ${stop.passengerName}`;
      existing.points.push({ lat: stop.lat, lng: stop.lng });
      const n = existing.points.length;
      existing.lat = existing.points.reduce((s, p) => s + p.lat, 0) / n;
      existing.lng = existing.points.reduce((s, p) => s + p.lng, 0) / n;
    } else {
      clusters.push({
        kind: stop.kind,
        lat: stop.lat,
        lng: stop.lng,
        passengerIds: [stop.passengerId],
        label: stop.passengerName,
        points: [{ lat: stop.lat, lng: stop.lng }],
      });
    }
  }

  return clusters.map(({ points, ...stop }) => stop);
}

/** Total straight-line distance (m) of driverStart → stops[0] → stops[1] → ... */
function totalDistance(start: LatLng, stops: PlannedStop[]): number {
  let total = 0;
  let prev = start;
  for (const stop of stops) {
    total += approxMetersBetween([prev.lat, prev.lng], [stop.lat, stop.lng]);
    prev = stop;
  }
  return total;
}

/**
 * True if every pickup in `order` comes before every dropoff sharing a
 * passenger id with it. `alreadyPickedUp` seeds passengers whose pickup
 * already happened before this planning window (mid-trip: they're in the
 * car, no pickup stop for them appears in `order` at all).
 */
function respectsPickupBeforeDropoff(order: PlannedStop[], alreadyPickedUp?: Set<string>): boolean {
  const pickedUpBy = new Set(alreadyPickedUp);
  for (const stop of order) {
    if (stop.kind === 'dropoff') {
      for (const id of stop.passengerIds) {
        if (!pickedUpBy.has(id)) return false;
      }
    } else {
      for (const id of stop.passengerIds) pickedUpBy.add(id);
    }
  }
  return true;
}

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const perm of permutations(rest)) {
      yield [items[i], ...perm];
    }
  }
}

/**
 * Finds the visiting order for `stops` (already clustered) that minimizes
 * total straight-line distance from `driverStart`, while never dropping off
 * a passenger before picking them up.
 *
 * Brute-forces every valid ordering — fine for the handful of stops a
 * single trip can realistically have (a few passengers means at most half
 * a dozen stops once nearby ones are combined), but would need a smarter
 * approach if the app ever supported many more passengers per trip at once.
 */
export function findOptimalStopOrder(
  driverStart: LatLng,
  stops: PlannedStop[],
  alreadyPickedUp?: Set<string>,
): PlannedStop[] {
  if (stops.length <= 1) return stops;

  let best: PlannedStop[] | null = null;
  let bestDistance = Infinity;

  for (const order of permutations(stops)) {
    if (!respectsPickupBeforeDropoff(order, alreadyPickedUp)) continue;
    const distance = totalDistance(driverStart, order);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = order;
    }
  }

  // Every ordering should satisfy the constraint for well-formed input
  // (each passenger contributes exactly one pickup and one dropoff), but
  // fall back to the input order rather than throwing if something's off.
  return best ?? stops;
}

/**
 * Full pipeline: cluster nearby stops, then order them optimally, then
 * label them sequentially starting from `startLabel` (the driver's own
 * position is assumed to be the letter before the first returned stop —
 * e.g. pass 'B' when the driver itself is already labelled 'A').
 */
export function planMultiStopTrip(
  driverStart: LatLng,
  passengers: PassengerRequest[],
  finalDestination: LatLng & { name: string },
  options?: { clusterDistanceM?: number; startLabel?: string },
): Array<PlannedStop & { letter: string }> {
  const clustered = clusterNearbyStops(passengers, options?.clusterDistanceM);
  const ordered = findOptimalStopOrder(driverStart, clustered);

  const finalStop: PlannedStop = {
    kind: 'dropoff', // reused loosely — the final destination isn't a passenger dropoff, just the last leg
    lat: finalDestination.lat,
    lng: finalDestination.lng,
    passengerIds: [],
    label: finalDestination.name,
  };

  const startCharCode = (options?.startLabel ?? 'B').charCodeAt(0);
  return [...ordered, finalStop].map((stop, i) => ({
    ...stop,
    letter: String.fromCharCode(startCharCode + i),
  }));
}
