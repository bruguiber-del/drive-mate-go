import { Menu, Volume2, VolumeX, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import SearchBar from "@/components/SearchBar";
import type { TravelMode } from "@/hooks/useRouting";
import type { SavedPlace } from "@/hooks/useSavedPlaces";
import { getSavedPlaceIcon } from "@/lib/savedPlaceIcons";

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
  /** Casa, trabajo y demás — fila de un solo toque bajo el buscador. */
  savedPlaces: SavedPlace[];
  onSelectSavedPlace: (place: SavedPlace) => void;
  onManageSavedPlaces: () => void;
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
  savedPlaces,
  onSelectSavedPlace,
  onManageSavedPlaces,
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
    <div
      className="absolute top-0 left-0 right-0 p-3 pointer-events-none"
      // "safe-area-inset-top" no es una clase real (ni de Tailwind ni
      // definida en el proyecto) — nunca ha aplicado nada. Sin este padding,
      // en una app instalada en pantalla de inicio (sin la barra de Safari
      // empujando el contenido hacia abajo) el botón de menú queda pegado
      // bajo la barra de estado/notch, en la zona que iOS reserva para sus
      // propios gestos, así que los toques ahí no le llegan a la app.
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
    >
      {/* Sin animación de entrada a propósito: es un control que SIEMPRE
          tiene que estar disponible (el menú y el buscador), y una
          animación de montaje puede quedarse congelada a mitad — p. ej. si
          el navegador manda la pestaña a segundo plano justo entonces, al
          abrir un enlace externo (Stripe) en una pestaña nueva — dejando
          esto invisible (opacity:0) para siempre sin ningún aviso. */}
      <div className="flex items-center gap-2">
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
          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
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
          </div>
        )}
      </div>

      {/* Casa, trabajo y demás, justo debajo del buscador sin llegar a
          tocarlo — un solo toque para ir directo, visible nada más entrar
          a la app, a petición explícita del usuario. Solo antes de
          navegar, igual que el propio buscador. */}
      {!isNavigating && savedPlaces.length > 0 && (
        <div className="pointer-events-auto flex gap-2 mt-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {savedPlaces.map((p) => {
            const Icon = getSavedPlaceIcon(p);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectSavedPlace(p)}
                className="shrink-0 flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full glass text-xs font-medium text-foreground"
              >
                <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                {p.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onManageSavedPlaces}
            aria-label="Añadir sitio guardado"
            className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full glass"
          >
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  );
};

export default NavTopBar;
