import type { PlannedStop } from "@/lib/multiStopPlanning";
import type { PassengerStopPill } from "@/components/StopConfirmButtons";

export interface TrackedPassengerEntry {
  passenger: { id: string; name: string; acceptsPets?: boolean; hasChildSeat?: boolean };
  status: "waiting_pickup" | "in_car";
}

/** Una chapa por pasajero a bordo o pendiente, con sus minutos hasta recogida
 *  y hasta bajada según la posición de cada parada en la ruta. */
export function buildPassengerStopPills(
  passengers: TrackedPassengerEntry[],
  stops: PlannedStop[],
  stopEtaMinutes: (number | undefined)[],
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
      dropoffEtaMin: dropoffIdx >= 0 ? stopEtaMinutes[dropoffIdx] : undefined,
      acceptsPets: passenger.acceptsPets,
      hasChildSeat: passenger.hasChildSeat,
    };
  });
}
