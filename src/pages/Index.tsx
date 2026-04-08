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
import DriverSettingsSheet from '@/components/DriverSettingsSheet';
import MatchPopup from '@/components/MatchPopup';
import SettingsMenu from '@/components/SettingsMenu';
import ProfileSection from '@/components/ProfileSection';
import TripHistory from '@/components/TripHistory';
import WalletSection from '@/components/WalletSection';
import HelpSection from '@/components/HelpSection';
import ActiveTripView from '@/components/ActiveTripView';
import RatingModal from '@/components/RatingModal';
import { useDriverTracking } from '@/hooks/useDriverTracking';

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
  
  // Trip ID for real-time tracking (in production, this would come from the database)
  const [activeTripId, setActiveTripId] = useState<string | null>(null);

  // Real-time driver tracking
  const { driverLocation, locationHistory } = useDriverTracking({
    tripId: activeTripId,
    isDriver: activeTripRole === 'driver',
    enabled: showActiveTrip,
  });

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
      duration: 500,
    });
  };

  const handleStopNavigation = () => {
    setIsNavigating(false);
    setDestination('');
    setDestinationCoords(null);
    toast({
      title: "Navegación detenida",
      duration: 500,
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
    // Generate a trip ID for tracking
    const newTripId = crypto.randomUUID();
    setActiveTripId(newTripId);
    setShowActiveTrip(true);
    toast({
      title: "¡Viaje confirmado!",
      description: "Tu conductor está en camino. Puedes ver su ubicación en tiempo real.",
    });
  };

  const handleMatchAccept = () => {
    setShowMatchPopup(false);
    // Generate a trip ID for tracking
    const newTripId = crypto.randomUUID();
    setActiveTripId(newTripId);
    
    // Check if we came from driver mode or passenger mode
    if (isDriverMode) {
      setActiveTripRole('driver');
      toast({
        title: "¡Viaje aceptado!",
        description: "Tu ubicación se compartirá con el pasajero en tiempo real.",
      });
    } else {
      setActiveTripRole('passenger');
      toast({
        title: "¡Viaje aceptado!",
        description: "Puedes ver la ubicación del conductor en tiempo real.",
      });
    }
    setTripStatus('waiting');
    setShowActiveTrip(true);
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
    setActiveTripId(null); // Clear trip ID to stop tracking
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

  // Show driver marker on map for passengers during active trip
  const showDriverOnMap = showActiveTrip && activeTripRole === 'passenger';

  return (
    <div className="h-screen w-screen overflow-hidden">
      <MapView 
        destination={destinationCoords} 
        showRoute={isNavigating}
        driverLocation={driverLocation}
        driverLocationHistory={locationHistory}
        showDriverMarker={showDriverOnMap}
      >
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

        {/* Passenger Card - Below search bar, left aligned */}
        {!showActiveTrip && (
          <motion.div 
            className="absolute top-20 left-4 pointer-events-auto"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            <PassengerCard 
              onClick={() => setShowPassengerSearch(true)}
              hasActiveSearch={hasActivePassengerSearch}
            />
          </motion.div>
        )}

        {/* Unified Bottom Bar */}
        {!showActiveTrip && (
          <motion.div 
            className="absolute bottom-0 left-0 right-0 p-3 pb-6 safe-area-inset-bottom pointer-events-none"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center gap-2 pointer-events-auto">
              {/* Driver Toggle - Compact */}
              <DriverToggle 
                isDriver={isDriverMode} 
                onToggle={handleDriverToggle} 
              />
              
              {/* Driver Settings - Next to toggle */}
              {isDriverMode && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                >
                  <Button 
                    variant="glass" 
                    size="icon"
                    className="w-9 h-9"
                    onClick={() => setShowDriverSettings(true)}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                </motion.div>
              )}

              {/* Navigation Info - In the middle */}
              {isNavigating && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex-1 min-w-0"
                >
                  <div className="glass-strong rounded-lg px-2 py-1.5 flex items-center gap-2">
                    <Navigation className="w-3 h-3 text-primary shrink-0" />
                    <span className="text-xs text-foreground truncate">{destination}</span>
                    <span className="text-xs font-bold text-primary shrink-0">· 12 min</span>
                  </div>
                </motion.div>
              )}

              {/* Spacer */}
              {!isNavigating && <div className="flex-1" />}

              {/* Map Controls - Vertical stack on right */}
              <div className="flex flex-col gap-1">
                <Button 
                  variant="glass" 
                  size="icon" 
                  className="w-8 h-8"
                  onClick={() => {
                    if ((window as any).__mapZoomIn) {
                      (window as any).__mapZoomIn();
                    }
                  }}
                >
                  <span className="text-sm font-bold text-foreground">+</span>
                </Button>
                <Button 
                  variant="glass" 
                  size="icon" 
                  className="w-8 h-8"
                  onClick={() => {
                    if ((window as any).__mapZoomOut) {
                      (window as any).__mapZoomOut();
                    }
                  }}
                >
                  <span className="text-sm font-bold text-foreground">−</span>
                </Button>
                <Button 
                  variant="glass" 
                  size="icon" 
                  className="w-8 h-8"
                  onClick={() => {
                    if ((window as any).__mapCenterOnUser) {
                      (window as any).__mapCenterOnUser();
                    }
                  }}
                >
                  <Locate className="w-4 h-4 text-primary" />
                </Button>
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
      
      <DriverSettingsSheet 
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
        isDriverView={isDriverMode}
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
