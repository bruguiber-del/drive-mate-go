import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, CheckCircle, AlertCircle, Star, Car, Users, X, Camera, Armchair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ProfileSectionProps {
  isOpen: boolean;
  onClose: () => void;
}

export type SpacePreference = 'none' | 'spacious-car' | 'spacious-front';

const ProfileSection = ({ isOpen, onClose }: ProfileSectionProps) => {
  const [spacePreference, setSpacePreference] = useState<SpacePreference>('none');

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50"
    >
      <div className="absolute inset-0 bg-background/95 backdrop-blur-md" onClick={onClose} />
      
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25 }}
        className="absolute inset-x-0 bottom-0 top-12 bg-card rounded-t-3xl overflow-hidden"
      >
        <div className="h-full overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-card/95 backdrop-blur-sm p-4 flex items-center justify-between border-b border-border">
            <h2 className="text-xl font-bold text-foreground">Mi Perfil</h2>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="p-6 space-y-6">
            {/* Avatar & Name */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <User className="w-12 h-12 text-primary-foreground" />
                </div>
                <button className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg">
                  <Camera className="w-4 h-4 text-primary-foreground" />
                </button>
              </div>
              <h3 className="mt-4 text-xl font-bold text-foreground">Carlos García</h3>
              <p className="text-muted-foreground">carlos.garcia@email.com</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="glass rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-1 text-warning">
                  <Star className="w-5 h-5 fill-current" />
                  <span className="text-xl font-bold">4.8</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Valoración</p>
              </div>
              <div className="glass rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-1 text-primary">
                  <Car className="w-5 h-5" />
                  <span className="text-xl font-bold">47</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Como conductor</p>
              </div>
              <div className="glass rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-1 text-secondary">
                  <Users className="w-5 h-5" />
                  <span className="text-xl font-bold">32</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Como pasajero</p>
              </div>
            </div>

            {/* Passenger Comfort Preferences - Space */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Armchair className="w-5 h-5 text-secondary" />
                <h4 className="font-semibold text-foreground">Preferencias de comodidad</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Selecciona tu preferencia de espacio. Solo puedes elegir una opción.
              </p>
              
              <div className="space-y-2">
                <button
                  onClick={() => setSpacePreference('none')}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-xl transition-all",
                    spacePreference === 'none' 
                      ? "bg-primary/20 border-2 border-primary" 
                      : "glass border-2 border-transparent"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Armchair className={cn("w-5 h-5", spacePreference === 'none' ? "text-primary" : "text-muted-foreground")} />
                    <div className="text-left">
                      <p className="font-medium text-foreground">Me da igual el espacio</p>
                      <p className="text-sm text-muted-foreground">Sin coste adicional</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-success">+0€</span>
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                      spacePreference === 'none' ? "border-primary bg-primary" : "border-muted-foreground"
                    )}>
                      {spacePreference === 'none' && <div className="w-2.5 h-2.5 bg-primary-foreground rounded-full" />}
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setSpacePreference('spacious-car')}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-xl transition-all",
                    spacePreference === 'spacious-car' 
                      ? "bg-secondary/20 border-2 border-secondary" 
                      : "glass border-2 border-transparent"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Car className={cn("w-5 h-5", spacePreference === 'spacious-car' ? "text-secondary" : "text-muted-foreground")} />
                    <div className="text-left">
                      <p className="font-medium text-foreground">Coche amplio</p>
                      <p className="text-sm text-muted-foreground">SUV, monovolumen o similar</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-warning">+0,50€</span>
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                      spacePreference === 'spacious-car' ? "border-secondary bg-secondary" : "border-muted-foreground"
                    )}>
                      {spacePreference === 'spacious-car' && <div className="w-2.5 h-2.5 bg-secondary-foreground rounded-full" />}
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setSpacePreference('spacious-front')}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-xl transition-all",
                    spacePreference === 'spacious-front' 
                      ? "bg-success/20 border-2 border-success" 
                      : "glass border-2 border-transparent"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Armchair className={cn("w-5 h-5", spacePreference === 'spacious-front' ? "text-success" : "text-muted-foreground")} />
                    <div className="text-left">
                      <p className="font-medium text-foreground">Asiento delantero amplio</p>
                      <p className="text-sm text-muted-foreground">Reservar plaza delantera</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-warning">+1€</span>
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                      spacePreference === 'spacious-front' ? "border-success bg-success" : "border-muted-foreground"
                    )}>
                      {spacePreference === 'spacious-front' && <div className="w-2.5 h-2.5 bg-success-foreground rounded-full" />}
                    </div>
                  </div>
                </button>
              </div>

              <p className="text-xs text-muted-foreground px-2">
                El recargo se aplica automáticamente al precio final del viaje.
              </p>
            </div>

            {/* Verification Status */}
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">Estado de verificación</h4>
              
              <div className="glass rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">DNI Verificado</p>
                    <p className="text-sm text-muted-foreground">Verificado el 15/01/2024</p>
                  </div>
                </div>
              </div>

              <div className="glass rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Email Verificado</p>
                    <p className="text-sm text-muted-foreground">carlos.garcia@email.com</p>
                  </div>
                </div>
              </div>

              <div className="glass rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Carnet de conducir</p>
                    <p className="text-sm text-muted-foreground">Pendiente de verificar</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">Verificar</Button>
              </div>
            </div>

            {/* Personal Data */}
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">Datos personales</h4>
              
              <div className="space-y-2">
                <div className="glass rounded-xl p-4">
                  <label className="text-sm text-muted-foreground">Nombre completo</label>
                  <p className="font-medium text-foreground">Carlos García Martínez</p>
                </div>
                <div className="glass rounded-xl p-4">
                  <label className="text-sm text-muted-foreground">Teléfono</label>
                  <p className="font-medium text-foreground">+34 612 345 678</p>
                </div>
                <div className="glass rounded-xl p-4">
                  <label className="text-sm text-muted-foreground">Ciudad</label>
                  <p className="font-medium text-foreground">Huesca, España</p>
                </div>
              </div>
            </div>

            <Button variant="driver" className="w-full">Editar perfil</Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ProfileSection;
