import { motion } from "framer-motion";
import { Menu, Volume2, VolumeX, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import SearchBar from "@/components/SearchBar";
import type { TravelMode } from "@/hooks/useRouting";

interface NavTopBarProps {
  onOpenMenu: () => void;
  onOpenSearch: () => void;
  destination: string;
  isNavigating: boolean;
  travelMode?: TravelMode;
  /** True while the Directions request for the current route is in flight. */
  isRouteLoading?: boolean;
  /** False until the first real GPS fix arrives. */
  hasKnownLocation?: boolean;
  isMuted: boolean;
  onToggleMuted: () => void;
  onStopNavigation: () => void;
  /** Abre el buscador en modo "añadir parada" (gasolinera, súper...) sin
   *  tocar el destino final — solo tiene sentido mientras se navega, por
   *  eso vive aquí y no en la barra de búsqueda normal (esa se desactiva
   *  al navegar precisamente para no tocar el destino sin querer). */
  onOpenAddStop?: () => void;
}

/** Top bar: hamburger menu, the universal destination search bar, and — only
 * while navigating — the voice mute toggle and stop-navigation button. */
const NavTopBar = ({
  onOpenMenu,
  onOpenSearch,
  destination,
  isNavigating,
  travelMode = 'driving',
  isRouteLoading,
  hasKnownLocation = true,
  isMuted,
  onToggleMuted,
  onStopNavigation,
  onOpenAddStop,
}: NavTopBarProps) => {
  // Descompone la espera en dos fases con nombre, en vez de un "Navegando..."
  // fijo mientras no hay nada que ver todavía — así se nota qué está pasando.
  const statusText = !isNavigating
    ? undefined
    : !hasKnownLocation
      ? 'Obteniendo tu ubicación...'
      : isRouteLoading
        ? 'Calculando ruta...'
        : undefined;

  return (
    <div className="absolute top-0 left-0 right-0 p-3 safe-area-inset-top pointer-events-none">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center gap-2"
      >
        <Button variant="glass" size="icon-sm" className="shrink-0 pointer-events-auto" onClick={onOpenMenu}>
          <Menu className="w-4 h-4" />
        </Button>

        <div className="flex-1 min-w-0 pointer-events-auto">
          <SearchBar
            onClick={() => !isNavigating && onOpenSearch()}
            destination={destination}
            isNavigating={isNavigating}
            travelMode={travelMode}
            statusText={statusText}
          />
        </div>

        {isNavigating && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="pointer-events-auto flex shrink-0 items-center gap-1.5"
          >
            {onOpenAddStop && (
              <Button
                variant="glass"
                size="icon-sm"
                className="shrink-0"
                onClick={onOpenAddStop}
                aria-label="Añadir parada"
              >
                <Plus className="w-4 h-4 text-primary" />
              </Button>
            )}
            <Button
              variant="glass"
              size="icon-sm"
              className="shrink-0"
              onClick={onToggleMuted}
              aria-label={isMuted ? "Activar voz" : "Silenciar voz"}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Volume2 className="w-4 h-4 text-primary" />
              )}
            </Button>
            <Button className="shrink-0" variant="destructive" size="icon-sm" onClick={onStopNavigation}>
              <X className="w-4 h-4" />
            </Button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default NavTopBar;
