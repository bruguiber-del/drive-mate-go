import { useRef } from "react";
import { Menu, Volume2, VolumeX, X, Plus, Home, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import SearchBar from "@/components/SearchBar";
import type { TravelMode } from "@/hooks/useRouting";
import type { SavedPlace, SavedPlaceKind } from "@/hooks/useSavedPlaces";
import { getSavedPlaceIcon } from "@/lib/savedPlaceIcons";

const LONG_PRESS_MS = 400;
const MOVE_CANCEL_PX = 10;

/** Una chapa de sitio guardado en la fila rápida. Mantener pulsada (sin
 *  moverse) abre "Lugares guardados", donde ya se puede reordenar de
 *  verdad con flechas; un toque normal (soltar antes de los 400ms) la
 *  selecciona como siempre.
 *
 *  Arrastrar aquí mismo para reordenar NO es viable: en cuanto el dedo se
 *  mueve lo más mínimo (algo que pasa sin querer con cualquier mano real,
 *  a diferencia de un ratón), el propio navegador decide por su cuenta que
 *  es un gesto de scroll de la fila y se lo queda — ninguna lógica en JS
 *  puede ganarle esa carrera. Por eso se cancela el mantener-pulsado en
 *  cuanto hay el más mínimo movimiento (es justo lo que YA iba a pasar de
 *  todas formas) y se deja esa fila como lo que es: una fila que se
 *  desplaza con el dedo, no una lista que se reordena ahí mismo. */
const SavedPlaceChip = ({
  place,
  onSelect,
  onLongPress,
}: {
  place: SavedPlace;
  onSelect: (p: SavedPlace) => void;
  onLongPress: () => void;
}) => {
  const pressTimerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const longPressedRef = useRef(false);
  const Icon = getSavedPlaceIcon(place);

  const clearPressTimer = () => {
    if (pressTimerRef.current != null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  return (
    <button
      type="button"
      onPointerDown={(e: React.PointerEvent<HTMLButtonElement>) => {
        startRef.current = { x: e.clientX, y: e.clientY };
        longPressedRef.current = false;
        clearPressTimer();
        pressTimerRef.current = window.setTimeout(() => {
          pressTimerRef.current = null;
          longPressedRef.current = true;
          onLongPress();
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(e: React.PointerEvent<HTMLButtonElement>) => {
        if (pressTimerRef.current == null || !startRef.current) return;
        if (Math.abs(e.clientX - startRef.current.x) > MOVE_CANCEL_PX || Math.abs(e.clientY - startRef.current.y) > MOVE_CANCEL_PX) {
          clearPressTimer();
        }
      }}
      onPointerUp={clearPressTimer}
      onPointerCancel={clearPressTimer}
      onClick={() => {
        if (longPressedRef.current) {
          longPressedRef.current = false;
          return;
        }
        onSelect(place);
      }}
      className="shrink-0 flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full glass text-xs font-medium text-foreground select-none"
    >
      <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
      {place.label}
    </button>
  );
};

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
  /** Casa/Trabajo sin guardar todavía — abre el formulario de Ajustes ya
   *  con ese tipo elegido, en vez de mandar a elegirlo otra vez a mano. */
  onAddSavedPlaceKind: (kind: SavedPlaceKind) => void;
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
  onAddSavedPlaceKind,
}: NavTopBarProps) => {
  const homePlace = savedPlaces.find((p) => p.kind === 'home') ?? null;
  const workPlace = savedPlaces.find((p) => p.kind === 'work') ?? null;
  // Casa, Trabajo y el resto, todos en una sola fila reordenable — ya no
  // van fijos primero: el orden lo decide quien reordene (aquí o en
  // Ajustes, mismo campo "position" para los dos sitios).
  const orderedPlaces = [...savedPlaces].sort((a, b) => a.position - b.position);
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
          a la app, a petición explícita del usuario. Casa y Trabajo salen
          SIEMPRE, aunque no se hayan guardado todavía (en gris, invitando
          a configurarlos con un toque) — no hacía falta guardar nada
          primero para que aparecieran. Solo antes de navegar, igual que
          el propio buscador. */}
      {!isNavigating && (
        <div className="pointer-events-auto flex gap-2 mt-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Casa/Trabajo sin guardar todavía: invitan a configurarlos, fijos
              delante — no hay nada real que reordenar hasta que existan. */}
          {!homePlace && (
            <button
              type="button"
              onClick={() => onAddSavedPlaceKind('home')}
              className="shrink-0 flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-muted-foreground/40 text-muted-foreground"
            >
              <Home className="w-3.5 h-3.5 shrink-0" />
              Casa
            </button>
          )}
          {!workPlace && (
            <button
              type="button"
              onClick={() => onAddSavedPlaceKind('work')}
              className="shrink-0 flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-muted-foreground/40 text-muted-foreground"
            >
              <Briefcase className="w-3.5 h-3.5 shrink-0" />
              Trabajo
            </button>
          )}
          {orderedPlaces.map((p) => (
            <SavedPlaceChip key={p.id} place={p} onSelect={onSelectSavedPlace} onLongPress={onManageSavedPlaces} />
          ))}
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
