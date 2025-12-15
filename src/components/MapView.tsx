import mapBg from '@/assets/map-bg.jpg';

interface MapViewProps {
  children?: React.ReactNode;
}

const MapView = ({ children }: MapViewProps) => {
  return (
    <div className="relative w-full h-full overflow-hidden bg-background">
      {/* Map Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${mapBg})` }}
      >
        {/* Gradient overlays for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-background/30" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-transparent to-transparent" />
      </div>

      {/* Simulated route line glow effect */}
      <div className="absolute inset-0 pointer-events-none">
        <svg className="w-full h-full opacity-60" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <path 
            d="M 10,80 Q 30,60 50,50 T 90,20" 
            fill="none" 
            stroke="hsl(199 89% 48%)" 
            strokeWidth="0.5"
            filter="url(#glow)"
            className="animate-pulse-slow"
          />
        </svg>
      </div>

      {/* UI Layer */}
      {children}
    </div>
  );
};

export default MapView;
