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

/** Morado: tramo que se recorre hasta la parada que añades desde el buscador. */
export const ROUTE_BEFORE_STOP_COLOR = 'hsl(280, 70%, 55%)';

/** Nearest route vertex to a point — used to split the route at a stop. */
export const nearestCoordIndex = (coords: [number, number][], point: { lat: number; lng: number }): number => {
  let best = 0;
  let bestD = Infinity;
  coords.forEach(([lat, lng], i) => {
    const d = (lat - point.lat) ** 2 + (lng - point.lng) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
};

/** Per-segment features con el nivel de tráfico y si el tramo va antes
 *  (phase 'before') o después (phase 'after') del índice de corte. */
export const toRouteGeoJSON = (
  coords: [number, number][],
  congestion?: string[],
  splitIndex: number | null = null,
): GeoJSON.FeatureCollection<GeoJSON.LineString> => {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    features.push({
      type: 'Feature',
      properties: {
        congestion: congestion?.[i] ?? 'unknown',
        phase: splitIndex != null && i < splitIndex ? 'before' : 'after',
      },
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

export const ROUTE_PHASE_COLOR_EXPR: any = [
  'match',
  ['get', 'phase'],
  'before', ROUTE_BEFORE_STOP_COLOR,
  ROUTE_COLOR,
];

/** Borde de tráfico: verde = mucho tráfico fluyendo, rojo = retención. */
export const TRAFFIC_BORDER_COLOR_EXPR: any = [
  'match',
  ['get', 'congestion'],
  'heavy', 'hsl(142, 71%, 45%)',
  'hsl(0, 84%, 55%)',
];
export const TRAFFIC_BORDER_FILTER: any = ['in', ['get', 'congestion'], ['literal', ['heavy', 'severe']]];
