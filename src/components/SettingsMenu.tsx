import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, User, History, Shield, HelpCircle, LogOut, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const menuItems = [
  { icon: User, label: 'Mi perfil', description: 'Datos personales y verificación' },
  { icon: History, label: 'Historial', description: 'Viajes anteriores' },
  { icon: Shield, label: 'Seguridad', description: 'Verificación y pagos' },
  { icon: HelpCircle, label: 'Ayuda', description: 'Soporte y FAQ' },
];

const SettingsMenu = ({ isOpen, onClose }: SettingsMenuProps) => {
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
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                    <User className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground">Usuario</p>
                    <p className="text-sm text-muted-foreground">Editar perfil</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={onClose}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Menu Items */}
              <nav className="flex-1 space-y-2">
                {menuItems.map((item) => (
                  <button
                    key={item.label}
                    className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-muted transition-colors text-left group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <item.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </button>
                ))}
              </nav>

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
