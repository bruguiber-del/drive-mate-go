import { describe, it, expect } from 'vitest';
import {
  clusterNearbyStops,
  clusterPlannedStops,
  findOptimalStopOrder,
  planMultiStopTrip,
  type PassengerRequest,
  type PlannedStop,
} from './multiStopPlanning';
import { approxMetersBetween } from './mapGeo';

const driverStart = { lat: 0, lng: 0 };

describe('clusterNearbyStops', () => {
  it('keeps pickups and dropoffs separate when nobody is close by', () => {
    const passengers: PassengerRequest[] = [
      { id: 'p1', name: 'Ana', pickup: { lat: 0, lng: 1 }, dropoff: { lat: 0, lng: 5 } },
      { id: 'p2', name: 'Carlos', pickup: { lat: 0, lng: 10 }, dropoff: { lat: 0, lng: 15 } },
    ];
    const clusters = clusterNearbyStops(passengers, 100);
    expect(clusters).toHaveLength(4);
    expect(clusters.every((c) => c.passengerIds.length === 1)).toBe(true);
  });

  it('combines two pickups that are within the threshold into one shared stop', () => {
    const passengers: PassengerRequest[] = [
      { id: 'p1', name: 'Ana', pickup: { lat: 0, lng: 0 }, dropoff: { lat: 0, lng: 5 } },
      // ~11m away at the equator (0.0001° ≈ 11.1m) — well inside a 180m threshold.
      { id: 'p2', name: 'Carlos', pickup: { lat: 0, lng: 0.0001 }, dropoff: { lat: 0, lng: 10 } },
    ];
    const clusters = clusterNearbyStops(passengers, 180);
    // 1 combined pickup + 2 separate dropoffs = 3 stops, not 4.
    expect(clusters).toHaveLength(3);
    const combined = clusters.find((c) => c.passengerIds.length === 2);
    expect(combined).toBeDefined();
    expect(combined?.kind).toBe('pickup');
    expect(combined?.label).toBe('Ana + Carlos');
    expect(combined?.passengerIds.sort()).toEqual(['p1', 'p2']);
  });

  it('never combines a pickup with a dropoff, even at the exact same spot', () => {
    const samePoint = { lat: 10, lng: 10 };
    const passengers: PassengerRequest[] = [
      { id: 'p1', name: 'Ana', pickup: samePoint, dropoff: { lat: 20, lng: 20 } },
      { id: 'p2', name: 'Carlos', pickup: { lat: 30, lng: 30 }, dropoff: samePoint },
    ];
    const clusters = clusterNearbyStops(passengers, 500);
    expect(clusters).toHaveLength(4);
  });

  it('locates a combined stop at the average of the points it contains', () => {
    const passengers: PassengerRequest[] = [
      { id: 'p1', name: 'Ana', pickup: { lat: 0, lng: 0 }, dropoff: { lat: 0, lng: 5 } },
      { id: 'p2', name: 'Carlos', pickup: { lat: 0, lng: 0.0001 }, dropoff: { lat: 0, lng: 10 } },
    ];
    const clusters = clusterNearbyStops(passengers, 180);
    const combined = clusters.find((c) => c.passengerIds.length === 2)!;
    expect(combined.lat).toBeCloseTo(0, 5);
    expect(combined.lng).toBeCloseTo(0.00005, 5);
  });
});

describe('clusterPlannedStops', () => {
  it('merges same-kind stops within the threshold, same as clusterNearbyStops', () => {
    const stops = [
      { kind: 'dropoff' as const, lat: 0, lng: 0, passengerId: 'p1', passengerName: 'Ana' },
      { kind: 'dropoff' as const, lat: 0, lng: 0.0001, passengerId: 'p2', passengerName: 'Carlos' },
    ];
    const clustered = clusterPlannedStops(stops, 180);
    expect(clustered).toHaveLength(1);
    expect(clustered[0].passengerIds.sort()).toEqual(['p1', 'p2']);
  });

  it('never merges a pickup with a dropoff at the same point', () => {
    const stops = [
      { kind: 'pickup' as const, lat: 5, lng: 5, passengerId: 'p1', passengerName: 'Ana' },
      { kind: 'dropoff' as const, lat: 5, lng: 5, passengerId: 'p2', passengerName: 'Carlos' },
    ];
    expect(clusterPlannedStops(stops)).toHaveLength(2);
  });

  it('builds a mid-trip stop list: one passenger still waiting for pickup, another already in the car', () => {
    // Escenario real: p1 ya recogido (solo queda su bajada), p2 esperando.
    const raw = [
      { kind: 'dropoff' as const, lat: 0, lng: 5, passengerId: 'p1', passengerName: 'Ana' },
      { kind: 'pickup' as const, lat: 0, lng: 2, passengerId: 'p2', passengerName: 'Carlos' },
      { kind: 'dropoff' as const, lat: 0, lng: 8, passengerId: 'p2', passengerName: 'Carlos' },
    ];
    const clustered = clusterPlannedStops(raw);
    expect(clustered).toHaveLength(3);
    const order = findOptimalStopOrder(driverStart, clustered, new Set(['p1']));
    // p1 (ya en el coche) puede bajarse en cualquier momento; p2 debe
    // recogerse antes de poder dejarlo.
    const p2PickupIdx = order.findIndex((s) => s.kind === 'pickup' && s.passengerIds.includes('p2'));
    const p2DropoffIdx = order.findIndex((s) => s.kind === 'dropoff' && s.passengerIds.includes('p2'));
    expect(p2PickupIdx).toBeLessThan(p2DropoffIdx);
  });
});

describe('findOptimalStopOrder', () => {
  it('returns the single valid order for one passenger unchanged', () => {
    const stops: PlannedStop[] = [
      { kind: 'pickup', lat: 0, lng: 1, passengerIds: ['p1'], label: 'Ana' },
      { kind: 'dropoff', lat: 0, lng: 5, passengerIds: ['p1'], label: 'Ana' },
    ];
    const order = findOptimalStopOrder(driverStart, stops);
    expect(order.map((s) => s.kind)).toEqual(['pickup', 'dropoff']);
  });

  it('handles each passenger fully (pickup+dropoff) before the next when their stops are far apart', () => {
    // p1 vive muy cerca del conductor; p2 vive lejos. Lo lógico es
    // completar a p1 del todo antes de desviarse hacia p2.
    const p1Pickup: PlannedStop = { kind: 'pickup', lat: 0, lng: 1, passengerIds: ['p1'], label: 'Ana' };
    const p1Dropoff: PlannedStop = { kind: 'dropoff', lat: 0, lng: 1.5, passengerIds: ['p1'], label: 'Ana' };
    const p2Pickup: PlannedStop = { kind: 'pickup', lat: 0, lng: 10, passengerIds: ['p2'], label: 'Carlos' };
    const p2Dropoff: PlannedStop = { kind: 'dropoff', lat: 0, lng: 10.5, passengerIds: ['p2'], label: 'Carlos' };

    const order = findOptimalStopOrder(driverStart, [p2Dropoff, p1Dropoff, p2Pickup, p1Pickup]);
    expect(order).toEqual([p1Pickup, p1Dropoff, p2Pickup, p2Dropoff]);
  });

  it('never places a dropoff before its own passenger has been picked up', () => {
    // Un escenario donde recogida y bajada de los dos pasajeros se entrelazan
    // geográficamente — el orden "más corto a ciegas" tentaría a violar la regla.
    const stops: PlannedStop[] = [
      { kind: 'pickup', lat: 0, lng: 1, passengerIds: ['p1'], label: 'Ana' },
      { kind: 'dropoff', lat: 0, lng: 10, passengerIds: ['p1'], label: 'Ana' },
      { kind: 'pickup', lat: 0, lng: 9, passengerIds: ['p2'], label: 'Carlos' },
      { kind: 'dropoff', lat: 0, lng: 2, passengerIds: ['p2'], label: 'Carlos' },
    ];
    const order = findOptimalStopOrder(driverStart, stops);

    const indexOfStopContaining = (id: string, kind: 'pickup' | 'dropoff') =>
      order.findIndex((s) => s.kind === kind && s.passengerIds.includes(id));

    expect(indexOfStopContaining('p1', 'pickup')).toBeLessThan(indexOfStopContaining('p1', 'dropoff'));
    expect(indexOfStopContaining('p2', 'pickup')).toBeLessThan(indexOfStopContaining('p2', 'dropoff'));

    // Y de paso, que de verdad sea de las mejores válidas: no debería ser
    // peor que un par de alternativas también válidas construidas a mano.
    const distanceOf = (seq: PlannedStop[]) => {
      let total = 0;
      let prev = driverStart;
      for (const s of seq) {
        total += approxMetersBetween([prev.lat, prev.lng], [s.lat, s.lng]);
        prev = s;
      }
      return total;
    };
    const [p1p, p1d, p2p, p2d] = stops;
    const alternative1 = [p1p, p1d, p2p, p2d]; // válida: p1 antes de p2
    const alternative2 = [p2p, p1p, p1d, p2d]; // válida: intercalada de otra forma
    expect(distanceOf(order)).toBeLessThanOrEqual(distanceOf(alternative1));
    expect(distanceOf(order)).toBeLessThanOrEqual(distanceOf(alternative2));
  });

  it('leaves an empty or single-stop list untouched', () => {
    expect(findOptimalStopOrder(driverStart, [])).toEqual([]);
    const single: PlannedStop[] = [{ kind: 'pickup', lat: 0, lng: 1, passengerIds: ['p1'], label: 'Ana' }];
    expect(findOptimalStopOrder(driverStart, single)).toEqual(single);
  });

  it('orders dropoff-only stops by distance when every passenger is already picked up', () => {
    // Mitad de viaje: p1 y p2 ya están en el coche, solo quedan sus
    // bajadas — no hay ninguna parada de recogida en esta lista.
    const far: PlannedStop = { kind: 'dropoff', lat: 0, lng: 10, passengerIds: ['p1'], label: 'Ana' };
    const near: PlannedStop = { kind: 'dropoff', lat: 0, lng: 1, passengerIds: ['p2'], label: 'Carlos' };
    const order = findOptimalStopOrder(driverStart, [far, near], new Set(['p1', 'p2']));
    expect(order).toEqual([near, far]);
  });
});

describe('planMultiStopTrip', () => {
  it('labels a single-passenger trip as B (pickup), C (dropoff), D (final destination)', () => {
    const passengers: PassengerRequest[] = [
      { id: 'p1', name: 'Ana', pickup: { lat: 0, lng: 1 }, dropoff: { lat: 0, lng: 2 } },
    ];
    const plan = planMultiStopTrip(driverStart, passengers, { lat: 0, lng: 3, name: 'Tu destino' });

    expect(plan.map((s) => s.letter)).toEqual(['B', 'C', 'D']);
    expect(plan[0].kind).toBe('pickup');
    expect(plan[1].kind).toBe('dropoff');
    expect(plan[2].label).toBe('Tu destino');
  });

  it('gives the final destination the last letter, however many stops came before it', () => {
    const passengers: PassengerRequest[] = [
      { id: 'p1', name: 'Ana', pickup: { lat: 0, lng: 1 }, dropoff: { lat: 0, lng: 1.5 } },
      { id: 'p2', name: 'Carlos', pickup: { lat: 0, lng: 10 }, dropoff: { lat: 0, lng: 10.5 } },
    ];
    const plan = planMultiStopTrip(driverStart, passengers, { lat: 0, lng: 20, name: 'Destino' });

    expect(plan).toHaveLength(5); // 4 paradas de pasajeros + destino final
    expect(plan[plan.length - 1].letter).toBe('F');
    expect(plan[plan.length - 1].label).toBe('Destino');
  });

  it('respects a custom starting label', () => {
    const passengers: PassengerRequest[] = [
      { id: 'p1', name: 'Ana', pickup: { lat: 0, lng: 1 }, dropoff: { lat: 0, lng: 2 } },
    ];
    const plan = planMultiStopTrip(driverStart, passengers, { lat: 0, lng: 3, name: 'Destino' }, { startLabel: 'C' });
    expect(plan.map((s) => s.letter)).toEqual(['C', 'D', 'E']);
  });
});
