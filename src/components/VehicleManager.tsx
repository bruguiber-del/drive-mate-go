import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Car, Trash2, ShieldCheck, Camera, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Vehicle, FUEL_LABELS, CATEGORY_LABELS } from '@/lib/vehiclePricing';

interface VehicleManagerProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles: Vehicle[];
  activeVehicleId: string | null;
  onAdd: (brand: string, model: string, year: number, plate: string) => void;
  onRemove: (id: string) => void;
  onVerify: (id: string) => void;
  onSelect: (id: string) => void;
  mode: 'manage' | 'select';
  onConfirmSelect?: () => void;
}

const StatusBadge = ({ status }: { status: Vehicle['verificationStatus'] }) => {
  if (status === 'verified') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/20 text-success">
        Verificado
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-warning/20 text-warning">
        Pendiente
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
      Sin verificar
    </span>
  );
};

const VehicleManager = ({
  isOpen,
  onClose,
  vehicles,
  activeVehicleId,
  onAdd,
  onRemove,
  onVerify,
  onSelect,
  mode,
  onConfirmSelect,
}: VehicleManagerProps) => {
  const [showForm, setShowForm] = useState(false);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('2020');
  const [plate, setPlate] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingVerifyId = useRef<string | null>(null);

  const resetForm = () => {
    setBrand(''); setModel(''); setYear('2020'); setPlate(''); setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!plate.trim() || !brand.trim() || !model.trim()) return;
    onAdd(brand.trim(), model.trim(), Number(year), plate.trim().toUpperCase());
    resetForm();
  };

  const openPhotoPicker = (id: string) => {
    pendingVerifyId.current = id;
    fileInputRef.current?.click();
  };

  const handlePhotoChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const id = pendingVerifyId.current;
    if (id && e.target.files?.length) onVerify(id);
    pendingVerifyId.current = null;
    e.target.value = '';
  };

  const isSelectMode = mode === 'select';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] flex flex-col rounded-t-3xl bg-card border-t border-border"
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />

            {/* Header */}
            <div className="flex items-center justify-between p-4 pb-2">
              <h2 className="text-lg font-bold text-foreground">
                {isSelectMode ? '¿Con qué vehículo vas hoy?' : 'Mis vehículos'}
              </h2>
              <div className="flex items-center gap-1">
                {!isSelectMode && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setShowForm(s => !s)} aria-label="Añadir vehículo">
                    <Plus className="w-5 h-5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar">
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
              {/* Add form */}
              {showForm && (
                <form onSubmit={handleSubmit} className="rounded-xl border border-border p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="v-brand" className="text-xs">Marca</Label>
                      <Input id="v-brand" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Seat" required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="v-model" className="text-xs">Modelo</Label>
                      <Input id="v-model" value={model} onChange={e => setModel(e.target.value)} placeholder="Ibiza TDI" required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="v-year" className="text-xs">Año</Label>
                      <Input id="v-year" type="number" min={1990} max={2025} value={year} onChange={e => setYear(e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="v-plate" className="text-xs">Matrícula</Label>
                      <Input id="v-plate" value={plate} onChange={e => setPlate(e.target.value)} placeholder="1234 ABC" required />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    El consumo y el coste por km se calculan automáticamente.
                  </p>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" className="flex-1">Guardar vehículo</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={resetForm}>Cancelar</Button>
                  </div>
                </form>
              )}

              {/* Empty state */}
              {vehicles.length === 0 && !showForm && (
                <div className="text-center py-10 space-y-3">
                  <Car className="w-10 h-10 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Añade un vehículo primero</p>
                  <Button size="sm" onClick={() => setShowForm(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Añadir
                  </Button>
                </div>
              )}

              {/* Vehicle list */}
              {vehicles.map(v => {
                const selected = v.id === activeVehicleId;
                return (
                  <div
                    key={v.id}
                    role={isSelectMode ? 'button' : undefined}
                    onClick={isSelectMode ? () => onSelect(v.id) : undefined}
                    className={`rounded-xl border p-3 transition-colors ${
                      isSelectMode && selected ? 'border-primary bg-primary/10' : 'border-border'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {isSelectMode && (
                        <div className={`mt-1 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          selected ? 'border-primary' : 'border-muted-foreground'
                        }`}>
                          {selected && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-foreground">{v.brand} {v.model}</p>
                          <StatusBadge status={v.verificationStatus} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {v.year} · {v.licensePlate} · {FUEL_LABELS[v.fuelType]} · {CATEGORY_LABELS[v.category]}
                        </p>
                        <p className="text-sm font-semibold text-primary mt-1">
                          {v.costPerKm.toFixed(3)} €/km
                        </p>
                        {v.verificationStatus === 'verified' ? (
                          <p className="text-[11px] text-success">Datos precisos</p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">Estimación conservadora (+15%)</p>
                        )}

                        {!isSelectMode && (
                          <div className="flex gap-2 mt-3">
                            {v.verificationStatus !== 'verified' && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={v.verificationStatus === 'pending'}
                                onClick={() => openPhotoPicker(v.id)}
                              >
                                {v.verificationStatus === 'pending' ? (
                                  <><ShieldCheck className="w-4 h-4 mr-1" /> Verificando…</>
                                ) : (
                                  <><Camera className="w-4 h-4 mr-1" /> Verificar vehículo</>
                                )}
                              </Button>
                            )}
                            <Button variant="destructive" size="sm" onClick={() => onRemove(v.id)}>
                              <Trash2 className="w-4 h-4 mr-1" /> Eliminar
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {isSelectMode && vehicles.length > 0 && (
              <div className="p-4 pt-0">
                <Button
                  className="w-full"
                  disabled={!activeVehicleId}
                  onClick={() => onConfirmSelect?.()}
                >
                  <Check className="w-4 h-4 mr-1" /> Confirmar selección
                </Button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChosen}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default VehicleManager;
