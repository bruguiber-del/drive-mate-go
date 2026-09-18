import { describe, it, expect } from 'vitest';
import {
  approxMetersBetween,
  cumulativeDistanceExceeds,
  computeBearing,
  nextSpeedTier,
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
