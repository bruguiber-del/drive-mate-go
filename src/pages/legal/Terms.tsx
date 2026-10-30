import { Link } from 'react-router-dom';

const SECTION_TITLE = 'text-lg font-bold text-foreground mt-6 mb-2';

const Terms = () => (
  <main className="min-h-screen bg-background px-4 py-8">
    <div className="max-w-2xl mx-auto">
      <Link to="/" className="text-sm text-primary hover:underline">← Volver a VIMATCH</Link>
      <h1 className="text-2xl font-extrabold text-foreground mt-4 mb-1">Términos de uso</h1>
      <p className="text-sm text-muted-foreground mb-6">Última actualización: 30 de octubre de 2026</p>

      <div className="text-sm text-foreground/90 leading-relaxed space-y-1">
        <h2 className={SECTION_TITLE}>Fase de pruebas</h2>
        <p>
          VIMATCH está actualmente en fase de pruebas. Los pagos se procesan en modo de prueba de Stripe:
          ningún cargo real se realiza a través de la app por ahora. Cualquier acuerdo económico real entre
          conductor y pasajero debe gestionarse al margen de la app durante esta fase.
        </p>

        <h2 className={SECTION_TITLE}>Qué es VIMATCH</h2>
        <p>
          VIMATCH es una plataforma para compartir coche entre particulares que ya van a hacer un trayecto,
          bajo el modelo de reparto de gastos (no es un servicio de transporte comercial ni de alquiler de
          vehículos con conductor). El importe que paga cada pasajero cubre, como mucho, su parte del coste
          real del trayecto (combustible y mantenimiento) más una comisión reducida de la plataforma — nunca
          genera beneficio para quien conduce.
        </p>

        <h2 className={SECTION_TITLE}>Quién puede usarla</h2>
        <ul className="list-disc list-inside space-y-1">
          <li>Cualquiera puede ver el mapa sin registrarse.</li>
          <li>Para pedir o publicar un viaje hace falta una cuenta con tu nombre real.</li>
          <li>Para activar el modo conductor hace falta tener carnet de conducir en vigor, un vehículo real, y pasar la verificación de documentos de la app.</li>
        </ul>

        <h2 className={SECTION_TITLE}>Responsabilidad</h2>
        <p>
          VIMATCH pone en contacto a conductores y pasajeros, pero no es parte del trayecto en sí: cada
          conductor es responsable de conducir con su carnet en vigor, su vehículo en regla y el seguro
          correspondiente. VIMATCH no se hace responsable de accidentes, retrasos o incidencias durante el
          trayecto, más allá de las herramientas de valoración y verificación que ofrece la propia app.
        </p>

        <h2 className={SECTION_TITLE}>Conducta</h2>
        <p>
          No está permitido usar VIMATCH para fines distintos al reparto de gastos de un trayecto real, crear
          cuentas falsas, ni acosar o discriminar a otros usuarios. El incumplimiento puede suponer la
          suspensión de la cuenta.
        </p>

        <h2 className={SECTION_TITLE}>Tu cuenta</h2>
        <p>
          Puedes borrar tu cuenta y todos tus datos en cualquier momento desde{' '}
          <strong>Perfil → Borrar mi cuenta</strong>. Más detalles sobre qué datos tratamos en nuestra{' '}
          <Link to="/legal/privacidad" className="text-primary hover:underline">Política de privacidad</Link>.
        </p>

        <h2 className={SECTION_TITLE}>Contacto</h2>
        <p>
          Dudas sobre estos términos: <a href="mailto:bruguiber@gmail.com" className="text-primary hover:underline">bruguiber@gmail.com</a>.
        </p>
      </div>
    </div>
  </main>
);

export default Terms;
