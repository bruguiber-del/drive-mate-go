// Pure GeoJSON builders used by MapView's route/trail layers.

export const ROUTE_COLOR = 'hsl(199, 89%, 48%)';

/** Converts a plain [lat, lng][] polyline into a single GeoJSON LineString. */
export const toLineGeoJSON = (coords: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'LineString',
    // Convert [lat, lng] -> [lng, lat] for GeoJSON
    coordinates: coords.map(([lat, lng]) => [lng, lat]),
  },
});

export const CONGESTION_COLORS = {
  low: 'hsl(142, 71%, 45%)',       // verde — fluido
  moderate: 'hsl(38, 95%, 55%)',   // ámbar — moderado
  heavy: 'hsl(0, 84%, 55%)',       // rojo — denso
  severe: 'hsl(0, 72%, 40%)',      // rojo oscuro — atascado
  unknown: ROUTE_COLOR,
};

/** Split the route into per-segment features carrying their congestion level. */
export const toCongestionGeoJSON = (
  coords: [number, number][],
  congestion?: string[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> => {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const level = congestion?.[i] ?? 'unknown';
    features.push({
      type: 'Feature',
      properties: { congestion: level },
      geometry: {
        type: 'LineString',
        coordinates: [
          [coords[i][1], coords[i][0]],
          [coords[i + 1][1], coords[i + 1][0]],
        ],
      },
    });
  }
  return { type: 'FeatureCollection', features };
};

export const CONGESTION_COLOR_EXPR: any = [
  'match',
  ['get', 'congestion'],
  'low', CONGESTION_COLORS.low,
  'moderate', CONGESTION_COLORS.moderate,
  'heavy', CONGESTION_COLORS.heavy,
  'severe', CONGESTION_COLORS.severe,
  CONGESTION_COLORS.unknown,
];
