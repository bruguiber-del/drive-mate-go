import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, History, Wallet, Shield, HelpCircle, LogOut, ChevronRight, X, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (section: string) => void;
}

const menuItems = [
  { id: 'profile', icon: User, label: 'Mi perfil', description: 'Datos personales y verificación', badge: null },
  { id: 'history', icon: History, label: 'Historial', description: 'Viajes anteriores', badge: '79' },
  { id: 'wallet', icon: Wallet, label: 'Pagos', description: 'Cartera y métodos de pago', badge: '€67' },
  { id: 'security', icon: Shield, label: 'Seguridad', description: 'Verificación DNI', badge: 'verified' },
  { id: 'help', icon: HelpCircle, label: 'Ayuda', description: 'Soporte y FAQ', badge: null },
];

const SettingsMenu = ({ isOpen, onClose, onNavigate }: SettingsMenuProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* Menu */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-0 top-0 bottom-0 w-80 max-w-[85vw] z-50"
          >
            <div className="h-full bg-card border-r border-border p-6 flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-extrabold">
                  <span className="text-gradient">VI</span>
                  <span className="text-foreground">MATCH</span>
                </h1>
                <Button variant="ghost" size="icon-sm" onClick={onClose}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* User Card */}
              <button 
                className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-primary/20 to-secondary/20 mb-6 hover:from-primary/30 hover:to-secondary/30 transition-colors"
                onClick={() => {
                  onNavigate('profile');
                  onClose();
                }}
              >
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <User className="w-7 h-7 text-primary-foreground" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-bold text-foreground">Carlos García</p>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <CheckCircle className="w-4 h-4 text-success" />
                    <span>Verificado</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>

              {/* Menu Items */}
              <nav className="flex-1 space-y-1">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-muted transition-colors text-left group"
                    onClick={() => {
                      onNavigate(item.id);
                      onClose();
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <item.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    {item.badge === 'verified' ? (
                      <CheckCircle className="w-5 h-5 text-success" />
                    ) : item.badge ? (
                      <span className="px-2 py-1 rounded-full bg-primary/20 text-primary text-xs font-bold">
                        {item.badge}
                      </span>
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>
                ))}
              </nav>

              {/* Discount Banner */}
              <div className="glass rounded-xl p-4 mb-4 border border-success/30">
                <p className="text-sm text-foreground">
                  <span className="text-success font-bold">10% descuento</span> disponible en tu próximo viaje
                </p>
                <p className="text-xs text-muted-foreground mt-1">Por valorar tu último viaje</p>
              </div>

              {/* Logout */}
              <button className="flex items-center gap-4 p-4 rounded-xl hover:bg-destructive/10 transition-colors text-left group">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-destructive/20 transition-colors">
                  <LogOut className="w-5 h-5 text-muted-foreground group-hover:text-destructive transition-colors" />
                </div>
                <p className="font-medium text-foreground group-hover:text-destructive transition-colors">
                  Cerrar sesión
                </p>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SettingsMenu;
