import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, CheckCircle, AlertCircle, Star, Car, Users, X, Armchair, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useProfile } from '@/hooks/useProfile';

interface ProfileSectionProps {
  isOpen: boolean;
  onClose: () => void;
}

export type SpacePreference = 'none' | 'spacious-car' | 'spacious-front';

const ProfileSection = ({ isOpen, onClose }: ProfileSectionProps) => {
  const navigate = useNavigate();
  const {
    profile, authEmail, emailConfirmed, phoneConfirmed, isAuthenticated, loading,
    driverTripCount, passengerTripCount, updateProfile,
  } = useProfile();

  const [spacePreference, setSpacePreference] = useState<SpacePreference>('none');
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [draftCity, setDraftCity] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setDraftName(profile.fullName ?? '');
      setDraftPhone(profile.phone ?? '');
      setDraftCity(profile.city ?? '');
    }
  }, [profile]);

  if (!isOpen) return null;

  const startEditing = () => {
    setDraftName(profile?.fullName ?? '');
    setDraftPhone(profile?.phone ?? '');
    setDraftCity(profile?.city ?? '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await updateProfile({ fullName: draftName || null, phone: draftPhone || null, city: draftCity || null });
    setSaving(false);
    if (ok) setIsEditing(false);
  };

  const initials = (profile?.fullName || authEmail || '?').trim().charAt(0).toUpperCase();

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

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !isAuthenticated ? (
            <div className="p-6 flex flex-col items-center text-center gap-4 mt-10">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                <User className="w-10 h-10 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Todavía no has iniciado sesión</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Crea tu cuenta para tener tu propio perfil, guardar tus datos y ver tu historial real.
                </p>
              </div>
              <Button variant="driver" onClick={() => navigate('/auth')}>Iniciar sesión o registrarme</Button>
            </div>
          ) : (
          <div className="p-6 space-y-6">
            {/* Avatar & Name */}
            <div className="flex flex-col items-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <span className="text-3xl font-bold text-primary-foreground">{initials}</span>
              </div>
              <h3 className="mt-4 text-xl font-bold text-foreground">
                {profile?.fullName || 'Sin nombre todavía'}
              </h3>
              <p className="text-muted-foreground">{authEmail ?? profile?.phone ?? ''}</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="glass rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-1 text-warning">
                  <Star className="w-5 h-5 fill-current" />
                  <span className="text-xl font-bold">{profile?.averageRating.toFixed(1) ?? '5.0'}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Valoración</p>
              </div>
              <div className="glass rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-1 text-primary">
                  <Car className="w-5 h-5" />
                  <span className="text-xl font-bold">{driverTripCount}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Como conductor</p>
              </div>
              <div className="glass rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-1 text-secondary">
                  <Users className="w-5 h-5" />
                  <span className="text-xl font-bold">{passengerTripCount}</span>
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

            {/* Verification Status — señales reales, no fechas inventadas */}
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">Estado de verificación</h4>

              <div className="glass rounded-xl p-4 flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", emailConfirmed ? "bg-success/20" : "bg-warning/20")}>
                  {emailConfirmed
                    ? <CheckCircle className="w-5 h-5 text-success" />
                    : <AlertCircle className="w-5 h-5 text-warning" />}
                </div>
                <div>
                  <p className="font-medium text-foreground">{emailConfirmed ? 'Email verificado' : 'Email sin verificar'}</p>
                  <p className="text-sm text-muted-foreground">{authEmail ?? 'Sin correo asociado'}</p>
                </div>
              </div>

              <div className="glass rounded-xl p-4 flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", phoneConfirmed ? "bg-success/20" : "bg-warning/20")}>
                  {phoneConfirmed
                    ? <CheckCircle className="w-5 h-5 text-success" />
                    : <AlertCircle className="w-5 h-5 text-warning" />}
                </div>
                <div>
                  <p className="font-medium text-foreground">{phoneConfirmed ? 'Teléfono verificado' : 'Teléfono sin verificar'}</p>
                  <p className="text-sm text-muted-foreground">{profile?.phone ?? 'Sin número asociado'}</p>
                </div>
              </div>

              <div className="glass rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Carnet de conducir</p>
                    <p className="text-sm text-muted-foreground">Todavía no disponible</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Personal Data */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-foreground">Datos personales</h4>
                {!isEditing && (
                  <button className="text-sm font-medium text-primary" onClick={startEditing}>Editar</button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-name">Nombre completo</Label>
                    <Input id="profile-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Tu nombre" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-phone">Teléfono</Label>
                    <Input id="profile-phone" value={draftPhone} onChange={(e) => setDraftPhone(e.target.value)} placeholder="+34 600 000 000" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-city">Ciudad</Label>
                    <Input id="profile-city" value={draftCity} onChange={(e) => setDraftCity(e.target.value)} placeholder="Tu ciudad" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="ghost" className="flex-1" onClick={() => setIsEditing(false)} disabled={saving}>
                      Cancelar
                    </Button>
                    <Button variant="driver" className="flex-1" onClick={handleSave} disabled={saving}>
                      {saving ? 'Guardando...' : 'Guardar'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="glass rounded-xl p-4">
                    <label className="text-sm text-muted-foreground">Nombre completo</label>
                    <p className="font-medium text-foreground">{profile?.fullName || 'Sin especificar'}</p>
                  </div>
                  <div className="glass rounded-xl p-4">
                    <label className="text-sm text-muted-foreground">Teléfono</label>
                    <p className="font-medium text-foreground">{profile?.phone || 'Sin especificar'}</p>
                  </div>
                  <div className="glass rounded-xl p-4">
                    <label className="text-sm text-muted-foreground">Ciudad</label>
                    <p className="font-medium text-foreground">{profile?.city || 'Sin especificar'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ProfileSection;
