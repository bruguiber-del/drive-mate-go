import { motion } from 'framer-motion';
import { X, MapPin, Clock, Star, Car, User, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserTrips, formatTripDate, formatTripTime } from '@/hooks/useUserTrips';

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

const sampleTrips: DisplayTrip[] = [
  { id: 1, type: 'driver', origin: 'Huesca', destination: 'Zaragoza', date: '15 Dic 2024', time: '08:30', rating: 5, amount: 12.5 },
  { id: 2, type: 'passenger', origin: 'Zaragoza', destination: 'Huesca', date: '14 Dic 2024', time: '18:00', rating: 5, amount: 6.0 },
  { id: 3, type: 'driver', origin: 'Huesca', destination: 'Jaca', date: '12 Dic 2024', time: '09:00', rating: 4, amount: 8.0 },
  { id: 4, type: 'passenger', origin: 'Jaca', destination: 'Huesca', date: '12 Dic 2024', time: '17:30', rating: 5, amount: 7.5 },
];

const TripHistory = ({ isOpen, onClose }: TripHistoryProps) => {
  const { trips: realTrips, isAuthenticated } = useUserTrips(isOpen);

  const trips: DisplayTrip[] = isAuthenticated
    ? realTrips.map((t) => ({
        id: t.id,
        type: t.role,
        origin: t.originName ?? 'Origen',
        destination: t.destinationName ?? 'Destino',
        date: formatTripDate(t.createdAt),
        time: formatTripTime(t.createdAt),
        rating: t.rating ?? 0,
        amount: t.price ?? 0,
      }))
    : sampleTrips;

  const totalTrips = trips.length;
  const driverEarnings = trips
    .filter((t) => t.type === 'driver')
    .reduce((sum, t) => sum + t.amount, 0);

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

          <div className="p-4 space-y-3">
            {/* Stats Summary */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="glass rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-primary">79</p>
                <p className="text-sm text-muted-foreground">Viajes totales</p>
              </div>
              <div className="glass rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-success">€234.50</p>
                <p className="text-sm text-muted-foreground">Ganado como conductor</p>
              </div>
            </div>

            {/* Trip List */}
            {trips.map((trip, index) => (
              <motion.div
                key={trip.id}
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
                        <span className="text-sm font-bold text-success">+€{trip.earnings.toFixed(2)}</span>
                      ) : (
                        <span className="text-sm font-medium text-foreground">-€{trip.cost.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default TripHistory;
