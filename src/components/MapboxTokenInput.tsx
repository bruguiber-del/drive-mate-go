import { useState } from 'react';
import { motion } from 'framer-motion';
import { Key, ExternalLink, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface MapboxTokenInputProps {
  onValidToken: (token: string) => void;
  isLoading: boolean;
}

const MapboxTokenInput = ({ onValidToken, isLoading }: MapboxTokenInputProps) => {
  const [inputToken, setInputToken] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!inputToken.trim()) {
      setError('Introduce tu token de Mapbox');
      return;
    }

    if (!inputToken.startsWith('pk.')) {
      setError('El token debe empezar con "pk."');
      return;
    }

    setError('');
    onValidToken(inputToken.trim());
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="absolute inset-0 flex items-center justify-center bg-background/95 backdrop-blur-xl z-50 p-6"
    >
      <div className="w-full max-w-md glass-strong rounded-3xl p-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/20 flex items-center justify-center mb-4">
            <Key className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Configura Mapbox</h2>
          <p className="text-muted-foreground text-sm">
            Para ver el mapa en tiempo real, necesitas un token público de Mapbox
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Input
              type="text"
              placeholder="pk.eyJ1Ijoi..."
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
              className="bg-muted/50 border-border/50"
            />
            {error && (
              <p className="text-destructive text-sm">{error}</p>
            )}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Validando...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Activar mapa
              </>
            )}
          </Button>

          <a
            href="https://account.mapbox.com/access-tokens/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-sm text-primary hover:underline"
          >
            <ExternalLink className="w-4 h-4" />
            Obtener token en Mapbox
          </a>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          El token se guarda localmente en tu dispositivo
        </p>
      </div>
    </motion.div>
  );
};

export default MapboxTokenInput;
