import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, Settings, Locate, X, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import MapView from '@/components/MapView';
import DriverToggle from '@/components/DriverToggle';
import SearchBar from '@/components/SearchBar';
import NavigationSearch from '@/components/NavigationSearch';
import PassengerCard from '@/components/PassengerCard';
import PassengerSearch from '@/components/PassengerSearch';
import DriverSettings from '@/components/DriverSettings';
import MatchPopup from '@/components/MatchPopup';
import SettingsMenu from '@/components/SettingsMenu';

const Index = () => {
  const { toast } = useToast();
  const [isDriverMode, setIsDriverMode] = useState(false);
  const [showNavigationSearch, setShowNavigationSearch] = useState(false);
  const [showPassengerSearch, setShowPassengerSearch] = useState(false);
  const [showDriverSettings, setShowDriverSettings] = useState(false);
  const [showMatchPopup, setShowMatchPopup] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [destination, setDestination] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [hasActivePassengerSearch, setHasActivePassengerSearch] = useState(false);

  const handleDriverToggle = () => {
    setIsDriverMode(!isDriverMode);
    if (!isDriverMode) {
      toast({
        title: "Modo conductor activado",
        description: "Ahora recibirás solicitudes de pasajeros compatibles",
      });
      // Simulate a match after 3 seconds when driver mode is enabled
      setTimeout(() => setShowMatchPopup(true), 3000);
    }
  };

  const handleNavigate = (dest: string) => {
    setDestination(dest);
    setIsNavigating(true);
    toast({
      title: "Navegación iniciada",
      description: `Ruta hacia ${dest}`,
    });
  };

  const handleStopNavigation = () => {
    setIsNavigating(false);
    setDestination('');
    toast({
      title: "Navegación detenida",
    });
  };

  const handlePassengerSearch = (data: any) => {
    setHasActivePassengerSearch(true);
    toast({
      title: "Buscando conductores...",
      description: `Hacia ${data.destination} por máx. ${data.budget}€`,
    });
  };

  const handleMatchAccept = () => {
    setShowMatchPopup(false);
    toast({
      title: "¡Viaje aceptado!",
      description: "Redirigiendo hacia el punto de recogida",
    });
  };

  const handleMatchReject = () => {
    setShowMatchPopup(false);
    toast({
      title: "Solicitud rechazada",
      description: "Seguirás recibiendo nuevas solicitudes",
    });
  };

  return (
    <div className="h-screen w-screen overflow-hidden">
      <MapView>
        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 p-4 safe-area-inset-top">
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center gap-3"
          >
            {/* Menu Button */}
            <Button 
              variant="glass" 
              size="icon" 
              className="shrink-0"
              onClick={() => setShowSettingsMenu(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>

            {/* Navigation Search Bar */}
            <div className="flex-1">
              <SearchBar 
                onClick={() => !isNavigating && setShowNavigationSearch(true)} 
                destination={destination}
                isNavigating={isNavigating}
              />
            </div>

            {/* Stop Navigation Button */}
            {isNavigating && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
              >
                <Button 
                  variant="destructive" 
                  size="icon"
                  onClick={handleStopNavigation}
                >
                  <X className="w-5 h-5" />
                </Button>
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* Center - Location Button */}
        <motion.div 
          className="absolute right-4 top-1/2 -translate-y-1/2"
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Button variant="glass" size="icon" className="shadow-lg">
            <Locate className="w-5 h-5 text-primary" />
          </Button>
        </motion.div>

        {/* Logo - only show when not navigating */}
        <AnimatePresence>
          {!isNavigating && (
            <motion.div 
              className="absolute top-24 left-1/2 -translate-x-1/2"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ delay: 0.4 }}
            >
              <h1 className="text-3xl font-extrabold tracking-tight">
                <span className="text-gradient">VI</span>
                <span className="text-foreground">MATCH</span>
              </h1>
              <p className="text-center text-sm text-muted-foreground mt-1">
                El navegador social
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation Info Panel - shows when navigating */}
        <AnimatePresence>
          {isNavigating && (
            <motion.div
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="absolute top-24 left-4 right-4"
            >
              <div className="glass-strong rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                    <Navigation className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Navegando hacia</p>
                    <p className="font-bold text-foreground truncate">{destination}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">12</p>
                    <p className="text-xs text-muted-foreground">min</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Controls */}
        <motion.div 
          className="absolute bottom-0 left-0 right-0 p-4 pb-8 safe-area-inset-bottom"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex flex-col gap-4">
            {/* Passenger Card - Separate section for finding drivers */}
            <PassengerCard 
              onClick={() => setShowPassengerSearch(true)}
              hasActiveSearch={hasActivePassengerSearch}
            />

            {/* Driver Toggle & Settings */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <DriverToggle 
                  isDriver={isDriverMode} 
                  onToggle={handleDriverToggle} 
                />
              </div>
              
              {isDriverMode && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                >
                  <Button 
                    variant="glass" 
                    size="icon"
                    onClick={() => setShowDriverSettings(true)}
                  >
                    <Settings className="w-5 h-5" />
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </MapView>

      {/* Modals */}
      <NavigationSearch 
        isOpen={showNavigationSearch}
        onClose={() => setShowNavigationSearch(false)}
        onNavigate={handleNavigate}
      />

      <PassengerSearch 
        isOpen={showPassengerSearch} 
        onClose={() => setShowPassengerSearch(false)}
        onSearch={handlePassengerSearch}
      />
      
      <DriverSettings 
        isOpen={showDriverSettings} 
        onClose={() => setShowDriverSettings(false)}
        onSave={(settings) => {
          toast({
            title: "Ajustes guardados",
            description: `${settings.seats} plazas, desvío máx. ${settings.maxDetour} min`,
          });
        }}
      />

      <MatchPopup 
        isOpen={showMatchPopup}
        onAccept={handleMatchAccept}
        onReject={handleMatchReject}
      />

      <SettingsMenu 
        isOpen={showSettingsMenu}
        onClose={() => setShowSettingsMenu(false)}
      />
    </div>
  );
};

export default Index;
