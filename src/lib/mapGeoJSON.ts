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

/** Morado: desvío respecto a la ruta principal (recoger/dejar pasajeros o
 *  una parada añadida desde el buscador). */
export const ROUTE_DETOUR_COLOR = 'hsl(280, 70%, 55%)';

/** Marca cada vértice de la ruta actual que queda a más de `thresholdM` de
 *  la ruta principal — ese tramo es un desvío. Null si no hay ruta principal
 *  con la que comparar. */
export const markDetourVertices = (
  coords: [number, number][],
  mainCoords: [number, number][] | null,
  thresholdM = 30,
): boolean[] | null => {
  if (!mainCoords || mainCoords.length === 0) return null;
  const metersPerDeg = 111_320;
  const thresholdSq = thresholdM * thresholdM;
  return coords.map(([lat, lng]) => {
    const cosLat = Math.cos((lat * Math.PI) / 180);
    for (const [mLat, mLng] of mainCoords) {
      const dy = (lat - mLat) * metersPerDeg;
      const dx = (lng - mLng) * metersPerDeg * cosLat;
      if (dx * dx + dy * dy <= thresholdSq) return false;
    }
    return true;
  });
};

/** Per-segment features con el nivel de tráfico y si el tramo es un desvío. */
export const toRouteGeoJSON = (
  coords: [number, number][],
  congestion?: string[],
  detourVertices: boolean[] | null = null,
): GeoJSON.FeatureCollection<GeoJSON.LineString> => {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const isDetour = !!detourVertices && (detourVertices[i] || detourVertices[i + 1]);
    features.push({
      type: 'Feature',
      properties: {
        congestion: congestion?.[i] ?? 'unknown',
        phase: isDetour ? 'detour' : 'main',
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
  'detour', ROUTE_DETOUR_COLOR,
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
