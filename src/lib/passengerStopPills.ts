import type { PlannedStop } from "@/lib/multiStopPlanning";
import type { PassengerStopPill } from "@/components/StopConfirmButtons";

export interface TrackedPassengerEntry {
  passenger: { id: string; name: string; acceptsPets?: boolean; hasChildSeat?: boolean };
  status: "waiting_pickup" | "in_car";
}

/** Una chapa por pasajero a bordo o pendiente, con sus minutos (y km) hasta
 *  recogida y hasta bajada según la posición de cada parada en la ruta.
 *  `stopEtaKm` es opcional — si no se pasa, la chapa solo enseña minutos,
 *  igual que antes de que existiera el dato de km por parada. */
export function buildPassengerStopPills(
  passengers: TrackedPassengerEntry[],
  stops: PlannedStop[],
  stopEtaMinutes: (number | undefined)[],
  stopEtaKm: (number | undefined)[] = [],
): PassengerStopPill[] {
  return passengers.map(({ passenger, status }) => {
    const pickupIdx = stops.findIndex((s) => s.kind === "pickup" && s.passengerIds.includes(passenger.id));
    const dropoffIdx = stops.findIndex((s) => s.kind === "dropoff" && s.passengerIds.includes(passenger.id));
    return {
      key: passenger.id,
      passengerId: passenger.id,
      name: passenger.name,
      status,
      pickupEtaMin: pickupIdx >= 0 ? stopEtaMinutes[pickupIdx] : undefined,
      pickupEtaKm: pickupIdx >= 0 ? stopEtaKm[pickupIdx] : undefined,
      dropoffEtaMin: dropoffIdx >= 0 ? stopEtaMinutes[dropoffIdx] : undefined,
      dropoffEtaKm: dropoffIdx >= 0 ? stopEtaKm[dropoffIdx] : undefined,
      acceptsPets: passenger.acceptsPets,
      hasChildSeat: passenger.hasChildSeat,
    };
  });
}
