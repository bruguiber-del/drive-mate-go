import { motion } from 'framer-motion';
import { X, HelpCircle, MessageCircle, Phone, Mail, ChevronRight, ChevronDown, Shield, Car, Users, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface HelpSectionProps {
  isOpen: boolean;
  onClose: () => void;
}

const faqs = [
  {
    category: 'General',
    icon: HelpCircle,
    questions: [
      { q: '¿Qué es Vimatch?', a: 'Vimatch es un navegador social que conecta conductores y pasajeros en tiempo real para compartir viajes en trayectos cotidianos, optimizando rutas y reduciendo costes.' },
      { q: '¿Cómo funciona el matching?', a: 'Nuestro algoritmo analiza rutas activas, horarios y preferencias para encontrar coincidencias óptimas con el mínimo desvío para el conductor.' },
    ]
  },
  {
    category: 'Conductores',
    icon: Car,
    questions: [
      { q: '¿Cuánta compensación puedo recibir?', a: 'La compensación por compartir gastos depende de la distancia y el número de pasajeros. Tú estableces tus preferencias y ves la compensación estimada antes de aceptar.' },
      { q: '¿Qué desvío máximo puedo configurar?', a: 'Puedes ajustar el desvío entre 2 y 15 minutos según tu disponibilidad.' },
    ]
  },
  {
    category: 'Pasajeros',
    icon: Users,
    questions: [
      { q: '¿Cómo funciona el punto de recogida?', a: 'La app calcula el punto óptimo para minimizar el desvío del conductor (máx. 5-10 min caminando). Puedes elegir "puerta a puerta" con coste extra.' },
      { q: '¿Puedo cancelar un viaje?', a: 'Sí, pero las cancelaciones tardías pueden afectar tu valoración.' },
    ]
  },
  {
    category: 'Pagos',
    icon: CreditCard,
    questions: [
      { q: '¿Cuándo se cobra/paga?', a: 'El pago se retiene al confirmar el viaje y se libera al conductor tras finalizar correctamente.' },
      { q: '¿Cuál es la comisión?', a: 'Vimatch cobra un 15% de comisión por cada viaje completado.' },
    ]
  },
];

const HelpSection = ({ isOpen, onClose }: HelpSectionProps) => {
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

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
            <h2 className="text-xl font-bold text-foreground">Ayuda y Soporte</h2>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="p-6 space-y-6">
            {/* Contact Options */}
            <div className="grid grid-cols-3 gap-3">
              <button className="glass rounded-xl p-4 flex flex-col items-center gap-2 hover:bg-muted/50 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">Chat</span>
              </button>
              <button className="glass rounded-xl p-4 flex flex-col items-center gap-2 hover:bg-muted/50 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center">
                  <Phone className="w-6 h-6 text-secondary" />
                </div>
                <span className="text-sm font-medium text-foreground">Llamar</span>
              </button>
              <button className="glass rounded-xl p-4 flex flex-col items-center gap-2 hover:bg-muted/50 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
                  <Mail className="w-6 h-6 text-accent-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground">Email</span>
              </button>
            </div>

            {/* Emergency */}
            <div className="glass rounded-xl p-4 flex items-center gap-3 border border-destructive/30">
              <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">¿Emergencia durante un viaje?</p>
                <p className="text-sm text-muted-foreground">Contacta con servicios de emergencia</p>
              </div>
              <Button variant="destructive" size="sm">SOS</Button>
            </div>

            {/* FAQs */}
            <div className="space-y-4">
              <h4 className="font-semibold text-foreground">Preguntas frecuentes</h4>
              
              {faqs.map((category) => (
                <div key={category.category} className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <category.icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{category.category}</span>
                  </div>
                  
                  {category.questions.map((faq, idx) => (
                    <button
                      key={idx}
                      className="w-full glass rounded-xl p-4 text-left hover:bg-muted/50 transition-colors"
                      onClick={() => setExpandedFaq(expandedFaq === `${category.category}-${idx}` ? null : `${category.category}-${idx}`)}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-foreground pr-4">{faq.q}</p>
                        {expandedFaq === `${category.category}-${idx}` ? (
                          <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                        )}
                      </div>
                      {expandedFaq === `${category.category}-${idx}` && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="text-sm text-muted-foreground mt-3 pt-3 border-t border-border"
                        >
                          {faq.a}
                        </motion.p>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default HelpSection;
