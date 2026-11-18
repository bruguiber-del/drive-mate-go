import { describe, it, expect } from 'vitest';
import {
  approxMetersBetween,
  cumulativeDistanceExceeds,
  computeBearing,
  bearingAlongRoute,
  markerScreenRotation,
  nextSpeedTier,
  nearestPointOnRoute,
  distanceAlongRoute,
  nearestRouteSegmentIndex,
} from './mapGeo';

describe('approxMetersBetween', () => {
  it('returns ~0 for the same point', () => {
    expect(approxMetersBetween([42.14, -0.4087], [42.14, -0.4087])).toBeCloseTo(0, 3);
  });

  it('returns ~111.32km for one degree of latitude', () => {
    // 1° latitud ≈ 111.32km en cualquier punto del planeta.
    const d = approxMetersBetween([0, 0], [1, 0]);
    expect(d).toBeCloseTo(111320, -2);
  });

  it('scales longitude distance by cos(latitude)', () => {
    // A la misma diferencia de longitud, a mayor latitud, menor distancia real.
    const atEquator = approxMetersBetween([0, 0], [0, 1]);
    const atHighLat = approxMetersBetween([60, 0], [60, 1]);
    expect(atHighLat).toBeLessThan(atEquator);
  });
});

describe('cumulativeDistanceExceeds', () => {
  it('is false for fewer than 2 points', () => {
    expect(cumulativeDistanceExceeds([[42.14, -0.4087]], 30)).toBe(false);
    expect(cumulativeDistanceExceeds([], 30)).toBe(false);
  });

  it('is false when the total path length stays under the threshold', () => {
    // ~0.00005° de latitud ≈ 5.5m — bien por debajo de 30m.
    const points: [number, number][] = [
      [42.1400, -0.4087],
      [42.14005, -0.4087],
    ];
    expect(cumulativeDistanceExceeds(points, 30)).toBe(false);
  });

  it('is true once the cumulative path length passes the threshold', () => {
    // ~0.001° de latitud ≈ 111m — supera 30m de sobra.
    const points: [number, number][] = [
      [42.1400, -0.4087],
      [42.1410, -0.4087],
    ];
    expect(cumulativeDistanceExceeds(points, 30)).toBe(true);
  });

  it('counts backtracking as movement (path length, not displacement)', () => {
    // Dos tramos de ~20m cada uno (por debajo del umbral por separado),
    // yendo hacia el norte y volviendo al punto de partida: el desplazamiento
    // neto es 0, pero el camino recorrido (~40m) supera el umbral de 30m.
    const points: [number, number][] = [
      [42.1400, -0.4087],
      [42.14018, -0.4087], // ~20m al norte
      [42.1400, -0.4087],  // vuelve al origen — otros ~20m
    ];
    expect(cumulativeDistanceExceeds(points, 30)).toBe(true);
    // Y confirmamos que un solo tramo de ~20m, por sí solo, NO basta.
    expect(cumulativeDistanceExceeds(points.slice(0, 2), 30)).toBe(false);
  });
});

describe('computeBearing', () => {
  it('points north (0°) when the target is directly north', () => {
    const bearing = computeBearing([0, 0], { lat: 1, lng: 0 });
    expect(bearing).toBeCloseTo(0, 0);
  });

  it('points east (90°) when the target is directly east, on the equator', () => {
    const bearing = computeBearing([0, 0], { lat: 0, lng: 1 });
    expect(bearing).toBeCloseTo(90, 0);
  });

  it('points south (180°) when the target is directly south', () => {
    const bearing = computeBearing([1, 0], { lat: 0, lng: 0 });
    expect(bearing).toBeCloseTo(180, 0);
  });

  it('points west (270°) when the target is directly west, on the equator', () => {
    const bearing = computeBearing([0, 1], { lat: 0, lng: 0 });
    expect(bearing).toBeCloseTo(270, 0);
  });

  it('always returns a value in [0, 360)', () => {
    const bearing = computeBearing([42.14, -0.4087], { lat: 41.65, lng: -0.89 });
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
  });
});

describe('markerScreenRotation', () => {
  it('points straight up (0°) when the map is already rotated to match the heading', () => {
    // Este es justo el caso que estaba mal antes de la corrección: el mapa
    // ya gira hacia el rumbo, así que el icono no debe rotar nada más.
    expect(markerScreenRotation(90, 90)).toBe(0);
    expect(markerScreenRotation(270, 270)).toBe(0);
  });

  it('uses the full heading when the map stays north-up (bearing 0)', () => {
    expect(markerScreenRotation(45, 0)).toBe(45);
    expect(markerScreenRotation(0, 0)).toBe(0);
  });

  it('returns only the difference when the map is partway through rotating', () => {
    // El mapa va camino de 90° pero todavía está en 45°: el icono debe
    // compensar solo lo que falta, no el rumbo completo.
    expect(markerScreenRotation(90, 45)).toBe(45);
  });

  it('always returns a value in [0, 360), even with negative differences', () => {
    expect(markerScreenRotation(10, 350)).toBe(20);
    expect(markerScreenRotation(0, 90)).toBe(270);
  });
});

describe('nearestPointOnRoute', () => {
  // Carretera recta hacia el norte, desde el origen.
  const straightRoute: [number, number][] = [
    [0, 0],
    [1, 0],
  ];

  it('returns null when the route has fewer than 2 points', () => {
    expect(nearestPointOnRoute([0.5, 0.0001], [[0, 0]])).toBeNull();
    expect(nearestPointOnRoute([0.5, 0.0001], [])).toBeNull();
  });

  it('snaps a point just off to the side of the road onto it', () => {
    // ~5m al este de la carretera, a medio camino — bien dentro del umbral.
    const offRoad: [number, number] = [0.5, 0.00005];
    const snapped = nearestPointOnRoute(offRoad, straightRoute);
    expect(snapped).not.toBeNull();
    expect(snapped![1]).toBeCloseTo(0, 4);
    expect(snapped![0]).toBeCloseTo(0.5, 2);
  });

  it('projects onto the segment, not past its endpoints', () => {
    // Un poco al norte-este del final de la carretera (~4m): el punto más
    // cercano es el propio extremo final, no una extrapolación de la línea.
    const beyondEnd: [number, number] = [1.00003, 0.00003];
    const snapped = nearestPointOnRoute(beyondEnd, straightRoute);
    expect(snapped).not.toBeNull();
    expect(snapped![0]).toBeCloseTo(1, 4);
    expect(snapped![1]).toBeCloseTo(0, 4);
  });

  it('returns null (no snap) when the point is a real detour, far from the route', () => {
    // ~1km al este — muy por encima de SNAP_TO_ROUTE_MAX_M (25m): es un
    // desvío real, no ruido de GPS, así que no debe ocultarse.
    const farAway: [number, number] = [0.5, 0.01];
    expect(nearestPointOnRoute(farAway, straightRoute)).toBeNull();
  });
});

describe('distanceAlongRoute', () => {
  const straightRoute: [number, number][] = [
    [0, 0],
    [1, 0],
  ];
  const totalLength = approxMetersBetween(straightRoute[0], straightRoute[1]);

  it('returns null when the route has fewer than 2 points', () => {
    expect(distanceAlongRoute([0.5, 0.0001], [[0, 0]])).toBeNull();
    expect(distanceAlongRoute([0.5, 0.0001], [])).toBeNull();
  });

  it('is ~0 right at the start of the route', () => {
    const d = distanceAlongRoute([0.0001, 0.00005], straightRoute);
    expect(d).not.toBeNull();
    expect(d!).toBeLessThan(20);
  });

  it('is roughly half the route length at the midpoint', () => {
    const d = distanceAlongRoute([0.5, 0.00005], straightRoute);
    expect(d).not.toBeNull();
    expect(Math.abs(d! - totalLength / 2)).toBeLessThan(50);
  });

  it('is roughly the full route length near the end', () => {
    const d = distanceAlongRoute([0.9999, 0.00005], straightRoute);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(totalLength - 50);
  });

  it('returns null for a real detour, far from the route', () => {
    expect(distanceAlongRoute([0.5, 0.01], straightRoute)).toBeNull();
  });

  it('orders points correctly on a route that loops back near its own start — the exact bug this fixes: picking the nearest STEP by straight-line distance to a maneuver point could jump to a geometrically close but route-wise distant step, like a roundabout exit sitting right next to its entrance', () => {
    const loop: [number, number][] = [
      [0, 0],
      [0, 0.01],
      [0.01, 0.01],
      [0.01, 0.0001],
    ];
    const nearStart = distanceAlongRoute([0.0001, 0.0001], loop);
    const nearEndButGeometricallyClose = distanceAlongRoute([0.0099, 0.0001], loop);
    expect(nearStart).not.toBeNull();
    expect(nearEndButGeometricallyClose).not.toBeNull();
    expect(nearEndButGeometricallyClose!).toBeGreaterThan(nearStart! + 1000);
  });
});

describe('nearestRouteSegmentIndex', () => {
  const threeSegmentRoute: [number, number][] = [
    [0, 0],
    [0.001, 0],
    [0.002, 0],
    [0.003, 0],
  ];

  it('returns null when the route has fewer than 2 points', () => {
    expect(nearestRouteSegmentIndex([0.0005, 0], [[0, 0]])).toBeNull();
  });

  it('identifies the first segment near the start', () => {
    expect(nearestRouteSegmentIndex([0.0002, 0.00001], threeSegmentRoute)).toBe(0);
  });

  it('identifies the middle segment partway along', () => {
    expect(nearestRouteSegmentIndex([0.0015, 0.00001], threeSegmentRoute)).toBe(1);
  });

  it('identifies the last segment near the end', () => {
    expect(nearestRouteSegmentIndex([0.0028, 0.00001], threeSegmentRoute)).toBe(2);
  });

  it('returns null for a real detour, far from the route', () => {
    expect(nearestRouteSegmentIndex([0.0015, 0.01], threeSegmentRoute)).toBeNull();
  });
});

describe('bearingAlongRoute', () => {
  const straightNorthRoute: [number, number][] = [
    [0, 0],
    [0.001, 0],
    [0.002, 0],
    [0.003, 0],
  ];

  it('returns null for a real detour, far from the route', () => {
    expect(bearingAlongRoute([0.0015, 0.01], straightNorthRoute, 30)).toBeNull();
  });

  it('points north along a straight north-heading route', () => {
    const bearing = bearingAlongRoute([0.00001, 0], straightNorthRoute, 30);
    expect(bearing).not.toBeNull();
    expect(bearing!).toBeCloseTo(0, 0);
  });

  // Carretera que va recto al norte y luego gira al este — igual que "ir
  // recto por una calle para luego girar a la derecha".
  const routeWithTurn: [number, number][] = [
    [0, 0],
    [0.001, 0],
    [0.001, 0.001],
  ];

  it('anticipates an upcoming turn before reaching it', () => {
    // A ~11m de la esquina, todavía en el tramo que va al norte — con 30m
    // de anticipación, el rumbo ya se inclina hacia el este, no se queda
    // plano en "norte" hasta llegar físicamente al giro.
    const bearing = bearingAlongRoute([0.0009, 0], routeWithTurn, 30);
    expect(bearing).not.toBeNull();
    expect(bearing!).toBeGreaterThan(30);
    expect(bearing!).toBeLessThan(90);
  });

  it('points straight along the current segment well before any turn', () => {
    const bearing = bearingAlongRoute([0.0001, 0], routeWithTurn, 30);
    expect(bearing).not.toBeNull();
    expect(bearing!).toBeCloseTo(0, 0);
  });

  it('aims at the last point when the route ends before the lookahead distance', () => {
    const shortRoute: [number, number][] = [[0, 0], [0.0001, 0]];
    const bearing = bearingAlongRoute([0, 0], shortRoute, 30);
    expect(bearing).not.toBeNull();
    expect(bearing!).toBeCloseTo(0, 0);
  });

  it('returns null once already at the end of the route', () => {
    const shortRoute: [number, number][] = [[0, 0], [0.0001, 0]];
    expect(bearingAlongRoute([0.0001, 0], shortRoute, 30)).toBeNull();
  });

  it('returns null when the route has fewer than 2 points', () => {
    expect(bearingAlongRoute([0, 0], [[0, 0]], 30)).toBeNull();
  });
});

describe('nextSpeedTier', () => {
  it('stays in "city" below 20 km/h', () => {
    expect(nextSpeedTier(0, 'city')).toBe('city');
    expect(nextSpeedTier(19, 'city')).toBe('city');
  });

  it('moves from "city" to "medium" above 20 km/h', () => {
    expect(nextSpeedTier(25, 'city')).toBe('medium');
  });

  it('jumps straight from "city" to "highway" above 80 km/h', () => {
    expect(nextSpeedTier(100, 'city')).toBe('highway');
  });

  it('has hysteresis coming down from "medium": needs to drop below 15, not just 20', () => {
    // A 18km/h veníamos de "medium" — no debe volver a "city" todavía.
    expect(nextSpeedTier(18, 'medium')).toBe('medium');
    expect(nextSpeedTier(10, 'medium')).toBe('city');
  });

  it('has hysteresis coming down from "highway": needs to drop below 70, not just 80', () => {
    expect(nextSpeedTier(75, 'highway')).toBe('highway');
    expect(nextSpeedTier(65, 'highway')).toBe('medium');
  });

  it('moves from "highway" to "city" in one step if speed drops below 15', () => {
    expect(nextSpeedTier(10, 'highway')).toBe('city');
  });
});
