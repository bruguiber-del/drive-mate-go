import { Link } from 'react-router-dom';

const SECTION_TITLE = 'text-lg font-bold text-foreground mt-6 mb-2';

const Privacy = () => (
  <main className="min-h-screen bg-background px-4 py-8">
    <div className="max-w-2xl mx-auto">
      <Link to="/" className="text-sm text-primary hover:underline">← Volver a VIMATCH</Link>
      <h1 className="text-2xl font-extrabold text-foreground mt-4 mb-1">Política de privacidad</h1>
      <p className="text-sm text-muted-foreground mb-6">Última actualización: 30 de octubre de 2026</p>

      <div className="text-sm text-foreground/90 leading-relaxed space-y-1">
        <h2 className={SECTION_TITLE}>Responsable</h2>
        <p>
          VIMATCH es un servicio en fase de pruebas. Los datos de identificación legal completos del
          responsable (nombre o razón social, NIF/CIF y domicilio) se están completando. Mientras tanto,
          puedes contactar para cualquier asunto relacionado con tus datos en{' '}
          <a href="mailto:bruguiber@gmail.com" className="text-primary hover:underline">bruguiber@gmail.com</a>.
        </p>

        <h2 className={SECTION_TITLE}>Qué datos recogemos</h2>
        <ul className="list-disc list-inside space-y-1">
          <li>Datos de cuenta: email o teléfono, nombre y apellidos, ciudad.</li>
          <li>Ubicación GPS, solo mientras usas la app activamente (buscar destino, navegar, o estar en modo conductor/pasajero) — nunca en segundo plano.</li>
          <li>Para conductores: fotos del carnet de conducir y de la matrícula del vehículo, usadas para verificar tu identidad y tu vehículo antes de poder llevar pasajeros.</li>
          <li>Datos de pago: no almacenamos el número de tu tarjeta — lo gestiona directamente Stripe, nuestro procesador de pagos.</li>
          <li>Historial de viajes y valoraciones que haces o recibes de otros usuarios.</li>
        </ul>

        <h2 className={SECTION_TITLE}>Para qué los usamos</h2>
        <ul className="list-disc list-inside space-y-1">
          <li>Emparejarte con conductores o pasajeros cuya ruta coincida con la tuya.</li>
          <li>Calcular el reparto de gastos del trayecto (combustible y mantenimiento, repartido entre quienes van en el coche, sin ánimo de lucro).</li>
          <li>Verificar que quien conduce tiene carnet y un vehículo real antes de activar el modo conductor.</li>
          <li>Procesar el cobro del reparto de gastos a través de Stripe.</li>
          <li>Enviarte avisos (p. ej. que te han aceptado un viaje), si activas las notificaciones.</li>
        </ul>

        <h2 className={SECTION_TITLE}>Con quién se comparte</h2>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Stripe</strong> — procesa los pagos; nunca vemos ni guardamos tu tarjeta.</li>
          <li><strong>Supabase / Lovable Cloud</strong> — aloja la base de datos de la aplicación.</li>
          <li><strong>Google</strong> — solo si eliges iniciar sesión con tu cuenta de Google.</li>
          <li><strong>Mapbox</strong> — calcula rutas y mapas; recibe coordenadas de origen/destino, no tu identidad.</li>
        </ul>
        <p>No vendemos tus datos a nadie ni los usamos con fines publicitarios.</p>

        <h2 className={SECTION_TITLE}>Cuánto tiempo los guardamos</h2>
        <p>Mientras tengas una cuenta activa. Si borras tu cuenta, se elimina todo de inmediato (ver abajo).</p>

        <h2 className={SECTION_TITLE}>Tus derechos</h2>
        <p>
          Tienes derecho a acceder, rectificar, portar y borrar tus datos (RGPD). Puedes borrar tu cuenta y
          todos tus datos tú mismo en cualquier momento desde <strong>Perfil → Borrar mi cuenta</strong>, o
          escribiendo a <a href="mailto:bruguiber@gmail.com" className="text-primary hover:underline">bruguiber@gmail.com</a>.
        </p>

        <h2 className={SECTION_TITLE}>Base legal</h2>
        <p>
          Tratamos tus datos para poder prestarte el servicio que pides (emparejarte y cobrar el reparto de
          gastos) y, para la ubicación GPS, con tu consentimiento expreso al activarla.
        </p>
      </div>
    </div>
  </main>
);

export default Privacy;
