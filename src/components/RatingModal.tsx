import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, User, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (rating: number) => void;
  userName: string;
  tripInfo: string;
}

const RatingModal = ({ isOpen, onClose, onSubmit, userName, tripInfo }: RatingModalProps) => {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);

  const handleSubmit = () => {
    if (rating > 0) {
      onSubmit(rating);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-background/90 backdrop-blur-md" onClick={onClose} />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="relative glass-strong rounded-3xl p-6 w-full max-w-sm"
          >
            {/* User Avatar */}
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-4">
                <User className="w-10 h-10 text-primary-foreground" />
              </div>
              
              <h3 className="text-xl font-bold text-foreground">¡Viaje completado!</h3>
              <p className="text-muted-foreground mt-1">{tripInfo}</p>
              
              <p className="mt-4 text-foreground">¿Cómo fue tu viaje con <span className="font-bold">{userName}</span>?</p>
            </div>

            {/* Star Rating */}
            <div className="flex justify-center gap-2 my-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  onClick={() => setRating(star)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-10 h-10 transition-colors ${
                      star <= (hoveredRating || rating)
                        ? 'text-warning fill-warning'
                        : 'text-muted stroke-muted-foreground'
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* Discount Notice */}
            <div className="glass rounded-xl p-3 flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                <Gift className="w-5 h-5 text-success" />
              </div>
              <p className="text-sm text-muted-foreground">
                Si ambos valoráis el viaje, obtendréis un <span className="text-success font-bold">10% de descuento</span> en el próximo.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={onClose}>
                Omitir
              </Button>
              <Button 
                variant="driver" 
                className="flex-1" 
                onClick={handleSubmit}
                disabled={rating === 0}
              >
                Enviar valoración
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RatingModal;
