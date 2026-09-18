import { motion } from "framer-motion";
import { Menu, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import SearchBar from "@/components/SearchBar";

interface NavTopBarProps {
  onOpenMenu: () => void;
  onOpenSearch: () => void;
  destination: string;
  isNavigating: boolean;
  isMuted: boolean;
  onToggleMuted: () => void;
  onStopNavigation: () => void;
}

/** Top bar: hamburger menu, the universal destination search bar, and — only
 * while navigating — the voice mute toggle and stop-navigation button. */
const NavTopBar = ({
  onOpenMenu,
  onOpenSearch,
  destination,
  isNavigating,
  isMuted,
  onToggleMuted,
  onStopNavigation,
}: NavTopBarProps) => {
  return (
    <div className="absolute top-0 left-0 right-0 p-4 safe-area-inset-top pointer-events-none">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center gap-3"
      >
        <Button variant="glass" size="icon" className="shrink-0 pointer-events-auto" onClick={onOpenMenu}>
          <Menu className="w-5 h-5" />
        </Button>

        <div className="flex-1 min-w-0 pointer-events-auto">
          <SearchBar
            onClick={() => !isNavigating && onOpenSearch()}
            destination={destination}
            isNavigating={isNavigating}
          />
        </div>

        {isNavigating && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="pointer-events-auto flex shrink-0 items-center gap-2"
          >
            <Button
              variant="glass"
              size="icon"
              className="shrink-0"
              onClick={onToggleMuted}
              aria-label={isMuted ? "Activar voz" : "Silenciar voz"}
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Volume2 className="w-5 h-5 text-primary" />
              )}
            </Button>
            <Button className="shrink-0" variant="destructive" size="icon" onClick={onStopNavigation}>
              <X className="w-5 h-5" />
            </Button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default NavTopBar;
