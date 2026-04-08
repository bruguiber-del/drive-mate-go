import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Clock, Navigation, X, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PassengerSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (data: SearchData) => void;
  onOpenSettings?: () => void;
}

interface SearchData {
  origin: string;
  destination: string;
  time: string;
  doorToDoor: boolean;
}

const PassengerSearch = ({ isOpen, onClose, onSearch, onOpenSettings }: PassengerSearchProps) => {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [time, setTime] = useState('');
  const [doorToDoor, setDoorToDoor] = useState(false);

  const handleSubmit = () => {
    onSearch({ origin, destination, time, doorToDoor });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto"
        >
          <div className="glass-strong rounded-t-3xl p-6 pb-8 shadow-float">
            {/* Handle */}
            <div className="flex justify-center mb-4">
              <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">Buscar viaje</h2>
              <Button variant="ghost" size="icon-sm" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Origin/Destination */}
            <div className="space-y-3 mb-6">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 bg-success rounded-full" />
                <input
                  type="text"
                  placeholder="¿Dónde estás?"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  className="w-full pl-10 pr-4 py-4 bg-muted rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Button variant="ghost" size="icon-sm" className="absolute right-2 top-1/2 -translate-y-1/2">
                  <Navigation className="w-4 h-4 text-primary" />
                </Button>
              </div>

              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 bg-secondary rounded-full" />
                <input
                  type="text"
                  placeholder="¿A dónde vas?"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full pl-10 pr-4 py-4 bg-muted rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Time */}
            <div className="mb-6">
              <div className="relative">
                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full pl-10 pr-4 py-4 bg-muted rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Hora de salida"
                />
              </div>
            </div>

            {/* Door to Door option */}
            <button
              onClick={() => setDoorToDoor(!doorToDoor)}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded-xl mb-6 transition-all",
                doorToDoor 
                  ? "bg-primary/20 border-2 border-primary" 
                  : "bg-muted border-2 border-transparent"
              )}
            >
              <div className="flex items-center gap-3">
                <MapPin className={cn("w-5 h-5", doorToDoor ? "text-primary" : "text-muted-foreground")} />
                <div className="text-left">
                  <p className="font-semibold text-foreground">Puerta a puerta</p>
                  <p className="text-sm text-muted-foreground">Recargo adicional por desvío</p>
                </div>
              </div>
              <div className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                doorToDoor ? "border-primary bg-primary" : "border-muted-foreground"
              )}>
                {doorToDoor && <div className="w-3 h-3 bg-primary-foreground rounded-full" />}
              </div>
            </button>

            {/* Preferences + Search */}
            <div className="flex gap-2">
              <Button
                variant="glass"
                size="lg"
                className="shrink-0"
                onClick={() => onOpenSettings?.()}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </Button>
              <Button 
                variant="passenger" 
                size="xl" 
                className="flex-1"
                onClick={handleSubmit}
              >
                Buscar conductores
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PassengerSearch;
