import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, CheckCircle, AlertCircle, Star, Car, Users, X, Loader2, Trash2, ShieldAlert, Pencil, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import IdentityVerification from '@/components/IdentityVerification';
import { PhoneNumberInput } from '@/components/PhoneNumberInput';
import AdminVerificationReview from '@/components/AdminVerificationReview';
import AdminReportsReview from '@/components/AdminReportsReview';
import PushNotificationCard from '@/components/PushNotificationCard';
import { Combobox } from '@/components/ui/combobox';
import { COUNTRY_CALLING_CODES } from '@/lib/countryCallingCodes';
import { SPANISH_CITIES } from '@/lib/spanishCities';

const COUNTRY_OPTIONS = COUNTRY_CALLING_CODES.map((c) => ({ value: c.iso2, label: c.name }));
const CITY_OPTIONS = SPANISH_CITIES.map((c) => ({ value: c, label: c }));
const OTHER_CITY = 'Otra';

function countryName(iso2: string | null): string {
  if (!iso2) return 'Sin especificar';
  return COUNTRY_CALLING_CODES.find((c) => c.iso2 === iso2)?.name ?? iso2;
}

/** Al cargar un perfil guardado, separa la ciudad en lo que va en el
 *  desplegable y lo que va en el campo libre (según el país y si la
 *  ciudad guardada está en la lista curada de España). */
function splitCityForCountry(country: string, city: string | null): { city: string; customCity: string } {
  if (!city) return { city: '', customCity: '' };
  if (country === 'ES') {
    return SPANISH_CITIES.includes(city) ? { city, customCity: '' } : { city: OTHER_CITY, customCity: city };
  }
  return { city: '', customCity: city };
}

interface ProfileSectionProps {
  isOpen: boolean;
  onClose: () => void;
}

// Único dueño de la app por ahora — sin backend de roles todavía, así que
// esto solo decide si se MUESTRA el botón; quien de verdad autoriza la
// acción es profiles.is_admin, comprobado en el servidor en las dos edge
// functions de revisión.
const ADMIN_EMAIL = 'bruguiber@gmail.com';

const ProfileSection = ({ isOpen, onClose }: ProfileSectionProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    profile, authEmail, emailConfirmed, phoneConfirmed, isAuthenticated, loading,
    driverTripCount, passengerTripCount, updateProfile,
  } = useProfile();

  const [isEditing, setIsEditing] = useState(false);
  const [editingNameInline, setEditingNameInline] = useState(false);
  const [inlineName, setInlineName] = useState('');
  const [savingInlineName, setSavingInlineName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [draftCountry, setDraftCountry] = useState('ES');
  const [draftCity, setDraftCity] = useState('');
  // Solo cuando la ciudad elegida en la lista es "Otra" (o el país no es
  // España, que no tiene lista curada de ciudades todavía).
  const [draftCustomCity, setDraftCustomCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAdminReview, setShowAdminReview] = useState(false);
  const [showAdminReports, setShowAdminReports] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
      const message = (data as { error?: string } | null)?.error;
      if (error || message) {
        toast({
          title: 'No se pudo borrar la cuenta',
          description: message ?? error?.message ?? 'Inténtalo de nuevo en un momento.',
          variant: 'destructive',
          duration: 3500,
        });
        return;
      }
      await supabase.auth.signOut();
      navigate('/');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  useEffect(() => {
    if (profile) {
      setDraftName(profile.fullName ?? '');
      setDraftPhone(profile.phone ?? '');
      const country = profile.country ?? 'ES';
      setDraftCountry(country);
      const split = splitCityForCountry(country, profile.city);
      setDraftCity(split.city);
      setDraftCustomCity(split.customCity);
    }
  }, [profile]);

  if (!isOpen) return null;

  const startEditing = () => {
    setDraftName(profile?.fullName ?? '');
    setDraftPhone(profile?.phone ?? '');
    const country = profile?.country ?? 'ES';
    setDraftCountry(country);
    const split = splitCityForCountry(country, profile?.city ?? null);
    setDraftCity(split.city);
    setDraftCustomCity(split.customCity);
    setIsEditing(true);
  };

  const startEditingNameInline = () => {
    setInlineName(profile?.fullName ?? '');
    setEditingNameInline(true);
  };

  // Edición de verdad ahí mismo, arriba — antes tocar el nombre/correo solo
  // bajaba hasta el campo de "Datos personales" para rellenarlo ahí, que
  // seguía siendo un paso de más en vez de escribir directamente donde se
  // tocó.
  const handleSaveNameInline = async () => {
    setSavingInlineName(true);
    const ok = await updateProfile({ fullName: inlineName.trim() || null });
    setSavingInlineName(false);
    if (ok) setEditingNameInline(false);
  };

  const effectiveCity = draftCountry === 'ES'
    ? (draftCity === OTHER_CITY ? draftCustomCity : draftCity)
    : draftCustomCity;

  const handleSave = async () => {
    setSaving(true);
    const ok = await updateProfile({
      fullName: draftName || null,
      phone: draftPhone || null,
      country: draftCountry || null,
      city: effectiveCity || null,
    });
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
              {/* Al tocar donde sale el correo se edita el NOMBRE ahí mismo,
                  sin bajar a ningún sitio — antes esto solo llevaba hasta
                  el campo de "Datos personales" más abajo para rellenarlo. */}
              {editingNameInline ? (
                <div className="flex items-center gap-1.5 w-full max-w-xs">
                  <Input
                    autoFocus
                    value={inlineName}
                    onChange={(e) => setInlineName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveNameInline();
                      if (e.key === 'Escape') setEditingNameInline(false);
                    }}
                    placeholder="Tu nombre y apellidos"
                    className="text-center h-8 text-sm"
                  />
                  <Button size="icon-sm" variant="ghost" disabled={savingInlineName} onClick={handleSaveNameInline}>
                    {savingInlineName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-success" />}
                  </Button>
                  <Button size="icon-sm" variant="ghost" disabled={savingInlineName} onClick={() => setEditingNameInline(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startEditingNameInline}
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>{authEmail ?? profile?.phone ?? ''}</span>
                  <Pencil className="w-3 h-3" />
                </button>
              )}
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

            <PushNotificationCard />

            {/* Verification Status — señales reales, no fechas inventadas */}
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">Estado de verificación</h4>

              <IdentityVerification phoneConfirmed={phoneConfirmed} />

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

              {authEmail === ADMIN_EMAIL && (
                <button
                  onClick={() => setShowAdminReview(true)}
                  className="w-full glass rounded-xl p-4 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Revisión de documentos (admin)</p>
                    <p className="text-sm text-muted-foreground">Aprobar o rechazar a mano lo que la IA no resolvió</p>
                  </div>
                </button>
              )}

              {authEmail === ADMIN_EMAIL && (
                <button
                  onClick={() => setShowAdminReports(true)}
                  className="w-full glass rounded-xl p-4 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
                    <ShieldAlert className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Denuncias y suspensiones (admin)</p>
                    <p className="text-sm text-muted-foreground">Revisar avisos SOS y cuentas suspendidas por valoración baja</p>
                  </div>
                </button>
              )}
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
                    <PhoneNumberInput id="profile-phone" value={draftPhone} onChange={setDraftPhone} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-country">País</Label>
                    <Combobox
                      id="profile-country"
                      options={COUNTRY_OPTIONS}
                      value={draftCountry}
                      onChange={(next) => {
                        setDraftCountry(next);
                        // La ciudad depende del país (de momento solo España
                        // tiene lista curada) — si cambia el país, limpia.
                        setDraftCity(''); setDraftCustomCity('');
                      }}
                      placeholder="Elige un país"
                      searchPlaceholder="Buscar país..."
                      emptyText="Ningún país coincide."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-city">Ciudad</Label>
                    {draftCountry === 'ES' ? (
                      <>
                        <Combobox
                          id="profile-city"
                          options={CITY_OPTIONS}
                          value={draftCity}
                          onChange={setDraftCity}
                          placeholder="Elige una ciudad"
                          searchPlaceholder="Buscar ciudad..."
                          emptyText="Ninguna ciudad coincide."
                        />
                        {draftCity === OTHER_CITY && (
                          <Input
                            value={draftCustomCity}
                            onChange={(e) => setDraftCustomCity(e.target.value)}
                            placeholder="Escribe tu ciudad"
                            className="mt-1.5"
                          />
                        )}
                      </>
                    ) : (
                      <Input
                        id="profile-city"
                        value={draftCustomCity}
                        onChange={(e) => setDraftCustomCity(e.target.value)}
                        placeholder="Tu ciudad"
                      />
                    )}
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
                    <label className="text-sm text-muted-foreground">País</label>
                    <p className="font-medium text-foreground">{countryName(profile?.country ?? null)}</p>
                  </div>
                  <div className="glass rounded-xl p-4">
                    <label className="text-sm text-muted-foreground">Ciudad</label>
                    <p className="font-medium text-foreground">{profile?.city || 'Sin especificar'}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Zona peligrosa */}
            <div className="space-y-2 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full glass rounded-xl p-4 flex items-center gap-3 text-left border border-destructive/20 hover:bg-destructive/5 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="font-medium text-destructive">Borrar mi cuenta</p>
                  <p className="text-sm text-muted-foreground">Elimina tu cuenta y todos tus datos de forma permanente</p>
                </div>
              </button>
            </div>
          </div>
          )}
        </div>
      </motion.div>
      {authEmail === ADMIN_EMAIL && (
        <>
          <AdminVerificationReview isOpen={showAdminReview} onClose={() => setShowAdminReview(false)} />
          <AdminReportsReview isOpen={showAdminReports} onClose={() => setShowAdminReports(false)} />
        </>
      )}
      <AlertDialog open={showDeleteConfirm} onOpenChange={(open) => !deleting && setShowDeleteConfirm(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar tu cuenta para siempre?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán tu perfil, vehículos, historial de viajes, valoraciones, documentos de
              verificación y cualquier otro dato asociado a tu cuenta. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteAccount();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sí, borrar mi cuenta'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

export default ProfileSection;
