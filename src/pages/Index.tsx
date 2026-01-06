import { useState } from 'react';
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
import ProfileSection from '@/components/ProfileSection';
import TripHistory from '@/components/TripHistory';
import WalletSection from '@/components/WalletSection';
import HelpSection from '@/components/HelpSection';
import ActiveTripView from '@/components/ActiveTripView';
import RatingModal from '@/components/RatingModal';

const Index = () => {
  const { toast } = useToast();
  const [isDriverMode, setIsDriverMode] = useState(false);
  const [showNavigationSearch, setShowNavigationSearch] = useState(false);
  const [showPassengerSearch, setShowPassengerSearch] = useState(false);
  const [showDriverSettings, setShowDriverSettings] = useState(false);
  const [showMatchPopup, setShowMatchPopup] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [destination, setDestination] = useState('');
  const [destinationCoords, setDestinationCoords] = useState<{ lng: number; lat: number; name: string } | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [hasActivePassengerSearch, setHasActivePassengerSearch] = useState(false);
  
  // New states for sections
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showActiveTrip, setShowActiveTrip] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [activeTripRole, setActiveTripRole] = useState<'driver' | 'passenger'>('passenger');
  const [tripStatus, setTripStatus] = useState<'waiting' | 'picked_up' | 'in_progress'>('waiting');

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

  const handleNavigate = (dest: string, coords: { lng: number; lat: number }) => {
    setDestination(dest);
    setDestinationCoords({ ...coords, name: dest });
    setIsNavigating(true);
    toast({
      title: "Navegación iniciada",
      description: `Ruta hacia ${dest}`,
    });
  };

  const handleStopNavigation = () => {
    setIsNavigating(false);
    setDestination('');
    setDestinationCoords(null);
    toast({
      title: "Navegación detenida",
    });
  };

  const handlePassengerSearch = (data: any) => {
    setHasActivePassengerSearch(true);
    toast({
      title: "Buscando conductores...",
      description: `Hacia ${data.destination}`,
    });
    // Simulate finding a match - shows driver notification for passenger to accept
    setTimeout(() => {
      setShowMatchPopup(true);
      setHasActivePassengerSearch(false);
    }, 2000);
  };

  const handlePassengerAcceptDriver = () => {
    setShowMatchPopup(false);
    setActiveTripRole('passenger');
    setTripStatus('waiting');
    setShowActiveTrip(true);
    toast({
      title: "¡Viaje confirmado!",
      description: "Tu conductor está en camino",
    });
  };

  const handleMatchAccept = () => {
    setShowMatchPopup(false);
    // Check if we came from driver mode or passenger mode
    if (isDriverMode) {
      setActiveTripRole('driver');
    } else {
      setActiveTripRole('passenger');
    }
    setTripStatus('waiting');
    setShowActiveTrip(true);
    toast({
      title: "¡Viaje aceptado!",
      description: isDriverMode ? "Redirigiendo hacia el punto de recogida" : "Tu conductor está en camino",
    });
  };

  const handlePickup = () => {
    setTripStatus('picked_up');
    toast({
      title: "¡Pasajero recogido!",
      description: "Continuando hacia el destino",
    });
  };

  const handleMatchReject = () => {
    setShowMatchPopup(false);
    toast({
      title: "Solicitud rechazada",
      description: "Seguirás recibiendo nuevas solicitudes",
    });
  };

  const handleTripEnd = () => {
    setShowActiveTrip(false);
    setTripStatus('waiting');
    setShowRating(true);
  };

  const handleMenuNavigate = (section: string) => {
    switch (section) {
      case 'profile':
        setShowProfile(true);
        break;
      case 'history':
        setShowHistory(true);
        break;
      case 'wallet':
        setShowWallet(true);
        break;
      case 'help':
        setShowHelp(true);
        break;
      case 'security':
        setShowProfile(true);
        break;
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden">
      <MapView destination={destinationCoords} showRoute={isNavigating}>
        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 p-4 safe-area-inset-top pointer-events-none">
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center gap-3"
          >
            {/* Menu Button */}
            <Button 
              variant="glass" 
              size="icon" 
              className="shrink-0 pointer-events-auto"
              onClick={() => setShowSettingsMenu(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>

            {/* Navigation Search Bar */}
            <div className="flex-1 pointer-events-auto">
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
                className="pointer-events-auto"
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
          className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-auto"
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Button variant="glass" size="icon" className="shadow-lg">
            <Locate className="w-5 h-5 text-primary" />
          </Button>
        </motion.div>

        {/* Logo - only show when not navigating and no active trip */}
        <AnimatePresence>
          {!isNavigating && !showActiveTrip && (
            <motion.div 
              className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none"
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
          {isNavigating && !showActiveTrip && (
            <motion.div
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="absolute top-24 left-4 right-4 pointer-events-auto"
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

        {/* Bottom Controls - hide when active trip */}
        {!showActiveTrip && (
          <motion.div 
            className="absolute bottom-0 left-0 right-0 p-4 pb-8 safe-area-inset-bottom pointer-events-none"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex flex-col gap-4 pointer-events-auto">
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
        )}
      </MapView>

      {/* Active Trip View */}
      <AnimatePresence>
        <ActiveTripView
          isOpen={showActiveTrip}
          onClose={handleTripEnd}
          userRole={activeTripRole}
          tripStatus={tripStatus}
          onPickup={handlePickup}
        />
      </AnimatePresence>

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
        onNavigate={handleMenuNavigate}
      />

      {/* Section Modals */}
      <ProfileSection 
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
      />

      <TripHistory 
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
      />

      <WalletSection 
        isOpen={showWallet}
        onClose={() => setShowWallet(false)}
      />

      <HelpSection 
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
      />

      <RatingModal
        isOpen={showRating}
        onClose={() => setShowRating(false)}
        onSubmit={(rating) => {
          toast({
            title: "¡Gracias por tu valoración!",
            description: "Has obtenido un 10% de descuento en tu próximo viaje",
          });
        }}
        userName="Ana M."
        tripInfo="Huesca → Zaragoza"
      />
    </div>
  );
};

export default Index;
