/** Formats a distance in meters as "123m" below 1km, or "1.2km" from 1km up. */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}
