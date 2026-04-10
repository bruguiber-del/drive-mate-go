/**
 * Meeting Point Calculator
 * Finds an optimal point where driver and passenger can meet,
 * respecting walking (≤10min) and driving detour (≤5min) constraints.
 */

const OSRM_DRIVING = 'https://router.project-osrm.org/route/v1/driving';
const OSRM_WALKING = 'https://router.project-osrm.org/route/v1/foot';

// Walking speed ~5km/h → 10min = ~833m
const MAX_WALKING_DISTANCE_M = 833;
// Max driving detour 5min (~4km at city speeds)
const MAX_DRIVING_DETOUR_M = 4000;

export interface MeetingPointResult {
  meetingPoint: { lat: number; lng: number; name: string };
  walkingRoute: { coordinates: [number, number][]; distance: number; duration: number };
  drivingDetour: { distance: number; duration: number };
  isValid: boolean;
  reason?: string;
}

/**
 * Calculate Haversine distance between two points in meters
 */
function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Fetch a walking route from OSRM
 */
async function fetchWalkingRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<{ coordinates: [number, number][]; distance: number; duration: number } | null> {
  try {
    const url = `${OSRM_WALKING}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;
    const route = data.routes[0];
    const coordinates: [number, number][] = route.geometry.coordinates.map(
      (c: [number, number]) => [c[1], c[0]] as [number, number]
    );
    return { coordinates, distance: route.distance, duration: route.duration };
  } catch {
    return null;
  }
}

/**
 * Fetch driving route duration/distance between two points
 */
async function fetchDrivingSegment(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<{ distance: number; duration: number } | null> {
  try {
    const url = `${OSRM_DRIVING}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;
    return { distance: data.routes[0].distance, duration: data.routes[0].duration };
  } catch {
    return null;
  }
}

/**
 * Given a driver's route coordinates (lat,lng pairs), find candidate meeting points
 * near the passenger that minimize detour while keeping walking ≤10min.
 */
function findCandidatePoints(
  routeCoords: [number, number][],
  passengerLat: number,
  passengerLng: number,
  maxDistM: number = MAX_WALKING_DISTANCE_M * 1.5 // pre-filter with some margin
): { lat: number; lng: number; straightDist: number; routeIndex: number }[] {
  const candidates: { lat: number; lng: number; straightDist: number; routeIndex: number }[] = [];

  // Sample every N points to avoid too many candidates
  const step = Math.max(1, Math.floor(routeCoords.length / 50));

  for (let i = 0; i < routeCoords.length; i += step) {
    const [lat, lng] = routeCoords[i];
    const dist = haversineDistance(passengerLat, passengerLng, lat, lng);
    if (dist <= maxDistM) {
      candidates.push({ lat, lng, straightDist: dist, routeIndex: i });
    }
  }

  // Sort by distance to passenger
  candidates.sort((a, b) => a.straightDist - b.straightDist);

  // Take top 5 candidates
  return candidates.slice(0, 5);
}

/**
 * Calculate the optimal meeting point between driver and passenger.
 * 
 * @param driverRoute - The driver's current route coordinates [lat,lng][]
 * @param driverPosition - Current driver position
 * @param passengerPosition - Passenger's location
 * @param driverDestination - Driver's final destination (to calculate detour)
 */
export async function calculateMeetingPoint(
  driverRoute: [number, number][],
  driverPosition: { lat: number; lng: number },
  passengerPosition: { lat: number; lng: number },
  driverDestination: { lat: number; lng: number }
): Promise<MeetingPointResult> {
  // 1. Find candidate points on/near the driver's route
  const candidates = findCandidatePoints(
    driverRoute,
    passengerPosition.lat,
    passengerPosition.lng
  );

  if (candidates.length === 0) {
    return {
      meetingPoint: { lat: 0, lng: 0, name: '' },
      walkingRoute: { coordinates: [], distance: 0, duration: 0 },
      drivingDetour: { distance: 0, duration: 0 },
      isValid: false,
      reason: 'No hay punto de encuentro válido dentro de 10 minutos andando',
    };
  }

  // 2. Get the baseline driving distance (driver → destination directly)
  const baseline = await fetchDrivingSegment(driverPosition, driverDestination);
  const baselineDistance = baseline?.distance ?? 0;

  // 3. Evaluate each candidate
  let bestResult: MeetingPointResult | null = null;
  let bestScore = Infinity;

  for (const candidate of candidates) {
    // Check walking route from passenger to candidate
    const walking = await fetchWalkingRoute(
      passengerPosition,
      { lat: candidate.lat, lng: candidate.lng }
    );

    if (!walking || walking.duration > 600) continue; // >10min walking

    // Check driving detour: driver → candidate → destination vs direct
    const driverToCandidate = await fetchDrivingSegment(
      driverPosition,
      { lat: candidate.lat, lng: candidate.lng }
    );
    const candidateToDest = await fetchDrivingSegment(
      { lat: candidate.lat, lng: candidate.lng },
      driverDestination
    );

    if (!driverToCandidate || !candidateToDest) continue;

    const detourDistance = (driverToCandidate.distance + candidateToDest.distance) - baselineDistance;
    const detourDuration = (driverToCandidate.duration + candidateToDest.duration) - (baseline?.duration ?? 0);

    if (detourDuration > 300) continue; // >5min detour

    // Score: minimize walking time + detour time
    const score = walking.duration + detourDuration * 2; // Weight detour more

    if (score < bestScore) {
      bestScore = score;
      bestResult = {
        meetingPoint: {
          lat: candidate.lat,
          lng: candidate.lng,
          name: 'Punto de encuentro',
        },
        walkingRoute: walking,
        drivingDetour: { distance: detourDistance, duration: detourDuration },
        isValid: true,
      };
    }
  }

  if (!bestResult) {
    // Fallback: use the closest point on route even if slightly over limits
    const closest = candidates[0];
    const walking = await fetchWalkingRoute(
      passengerPosition,
      { lat: closest.lat, lng: closest.lng }
    );

    return {
      meetingPoint: {
        lat: closest.lat,
        lng: closest.lng,
        name: 'Punto de encuentro (aproximado)',
      },
      walkingRoute: walking ?? { coordinates: [], distance: 0, duration: 0 },
      drivingDetour: { distance: 0, duration: 0 },
      isValid: false,
      reason: 'No se encontró un punto que cumpla todos los límites de tiempo',
    };
  }

  return bestResult;
}
