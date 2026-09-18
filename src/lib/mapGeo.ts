// Pure geo/math helpers used by MapView — extracted so they can be unit
// tested in isolation, without needing a live Mapbox instance.

/** Minimum GPS movement (m) before propagating a new position to the app. */
export const MIN_MOVE_METERS = 6;

const toRad = (d: number) => (d * Math.PI) / 180;

/**
 * Equirectangular approximation of the distance (m) between two [lat, lng]
 * points. Cheap and accurate enough for the short distances (tens of
 * metres) this app uses it for — GPS jitter filtering and "have we moved
 * far enough to trust the heading" checks.
 */
export function approxMetersBetween(a: [number, number], b: [number, number]): number {
  const dLat = (b[0] - a[0]) * 111320;
  const dLng = (b[1] - a[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/**
 * Walks a list of [lat, lng] points in order and returns true as soon as
 * the cumulative distance between consecutive points exceeds thresholdM.
 * Mirrors MapView's `hasReliableMovement`: it measures path length, not
 * straight-line displacement, so backtracking still counts as movement.
 */
export function cumulativeDistanceExceeds(
  points: [number, number][],
  thresholdM: number,
): boolean {
  let meters = 0;
  for (let i = 1; i < points.length; i += 1) {
    meters += approxMetersBetween(points[i - 1], points[i]);
    if (meters > thresholdM) return true;
  }
  return false;
}

/**
 * Initial great-circle bearing (degrees, 0-360, 0 = north) from `from` to
 * `to`, both [lat, lng]. This is the "as the crow flies" straight line
 * used to orient the map toward the destination before/while navigating.
 */
export function computeBearing(from: [number, number], to: { lat: number; lng: number }): number {
  const φ1 = toRad(from[0]);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from[1]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Speed tiers (km/h) driving the dynamic camera zoom/pitch while navigating. */
export type SpeedTier = 'city' | 'medium' | 'highway';

export const TIER_CAMERA: Record<SpeedTier, { zoom: number; pitch: number }> = {
  city: { zoom: 17.5, pitch: 60 },
  medium: { zoom: 16, pitch: 55 },
  highway: { zoom: 14.5, pitch: 45 },
};

/**
 * Next speed tier given the current speed (km/h) and tier, with hysteresis
 * (upward thresholds 20/80, downward 15/70) so the camera doesn't flicker
 * between tiers when the speed hovers near a boundary.
 */
export function nextSpeedTier(kmh: number, current: SpeedTier): SpeedTier {
  if (current === 'city') return kmh > 20 ? (kmh > 80 ? 'highway' : 'medium') : 'city';
  if (current === 'medium') {
    if (kmh > 80) return 'highway';
    if (kmh < 15) return 'city';
    return 'medium';
  }
  if (kmh < 15) return 'city';
  if (kmh < 70) return 'medium';
  return 'highway';
}
