import { motion } from 'framer-motion';
import { X, MapPin, Clock, Star, Car, User, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserTrips, formatTripDate, formatTripTime, type UserTrip } from '@/hooks/useUserTrips';

interface TripHistoryProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DisplayTrip {
  id: string | number;
  type: 'driver' | 'passenger';
  origin: string;
  destination: string;
  date: string;
  time: string;
  rating: number;
  amount: number;
}

const toDisplayTrip = (t: UserTrip): DisplayTrip => ({
  id: t.id,
  type: t.role,
  origin: t.originName ?? 'Origen',
  destination: t.destinationName ?? 'Destino',
  date: formatTripDate(t.createdAt),
  time: formatTripTime(t.createdAt),
  rating: t.rating ?? 0,
  amount: t.price ?? 0,
});

const TripCard = ({ trip, index }: { trip: DisplayTrip; index: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.05 }}
    className="glass rounded-xl p-4"
  >
    <div className="flex items-start gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
        trip.type === 'driver' ? 'bg-primary/20' : 'bg-secondary/20'
      }`}>
        {trip.type === 'driver' ? (
          <Car className="w-5 h-5 text-primary" />
        ) : (
          <User className="w-5 h-5 text-secondary" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground">{trip.origin}</span>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-foreground">{trip.destination}</span>
        </div>

        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
          <span>{trip.date}</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {trip.time}
          </span>
        </div>

        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={`w-3 h-3 ${
                  i < trip.rating ? 'text-warning fill-warning' : 'text-muted'
                }`}
              />
            ))}
          </div>

          {trip.type === 'driver' ? (
            <span className="text-sm font-bold text-success">+€{trip.amount.toFixed(2)}</span>
          ) : (
            <span className="text-sm font-medium text-foreground">-€{trip.amount.toFixed(2)}</span>
          )}
        </div>
      </div>
    </div>
  </motion.div>
);

const TripSection = ({ title, trips }: { title: string; trips: DisplayTrip[] }) => {
  if (trips.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground px-1">{title}</h3>
      <div className="space-y-3">
        {trips.map((trip, index) => (
          <TripCard key={trip.id} trip={trip} index={index} />
        ))}
      </div>
    </div>
  );
};

const TripHistory = ({ isOpen, onClose }: TripHistoryProps) => {
  const { trips: realTrips, isAuthenticated } = useUserTrips(isOpen);

  // Antes, sin sesión iniciada, se mostraban 4 viajes de muestra y las
  // cifras fijas "79 viajes" / "234,50€" como si fueran tuyas — una
  // inquietud real si alguien las toma por su propio historial. Sin cuenta
  // no hay datos que mostrar, así que se pide iniciar sesión directamente.
  //
  // A petición del usuario, el historial se separa en tres grupos en vez de
  // una lista única mezclada: como pasajero, como conductor compartiendo
  // viaje (con pasajeros de verdad, no una fila a 0€ de un emparejamiento
  // que no llegó a cuajar) y como conductor en solitario (donde 0€ sí es lo
  // normal, porque no hubo nadie con quien repartir el coste).
  const passengerTrips = isAuthenticated
    ? realTrips.filter((t) => t.role === 'passenger').map(toDisplayTrip)
    : [];
  const sharedDriverTrips = isAuthenticated
    ? realTrips.filter((t) => t.role === 'driver' && (t.realPassengerCount ?? 0) > 0).map(toDisplayTrip)
    : [];
  const soloDriverTrips = isAuthenticated
    ? realTrips.filter((t) => t.role === 'driver' && (t.realPassengerCount ?? 0) === 0).map(toDisplayTrip)
    : [];

  const totalTrips = passengerTrips.length + sharedDriverTrips.length + soloDriverTrips.length;
  const driverEarnings = sharedDriverTrips.reduce((sum, t) => sum + t.amount, 0);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50"
    >
      <div className="absolute inset-0 bg-background/95 backdrop-blur-md" onClick={onClose} />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25 }}
        className="absolute inset-x-0 bottom-0 top-12 bg-card rounded-t-3xl overflow-hidden"
      >
        <div className="h-full overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-card/95 backdrop-blur-sm p-4 flex items-center justify-between border-b border-border">
            <h2 className="text-xl font-bold text-foreground">Historial de viajes</h2>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="p-4 space-y-5">
            {!isAuthenticated ? (
              <div className="glass rounded-xl p-6 text-center">
                <User className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Inicia sesión para ver tu historial de viajes.</p>
              </div>
            ) : (
              <>
                {/* Stats Summary */}
                <div className="grid grid-cols-2 gap-3 mb-1">
                  <div className="glass rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-primary">{totalTrips}</p>
                    <p className="text-sm text-muted-foreground">Viajes totales</p>
                  </div>
                  <div className="glass rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-success">€{driverEarnings.toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground">Compensación como conductor</p>
                  </div>
                </div>

                {totalTrips === 0 && (
                  <div className="glass rounded-xl p-6 text-center">
                    <MapPin className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Todavía no tienes viajes registrados.</p>
                  </div>
                )}

                <TripSection title="Como pasajero" trips={passengerTrips} />
                <TripSection title="Como conductor · Compartiendo viaje" trips={sharedDriverTrips} />
                <TripSection title="Como conductor · En solitario" trips={soloDriverTrips} />
              </>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default TripHistory;
