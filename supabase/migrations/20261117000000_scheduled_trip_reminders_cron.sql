-- Aviso push de "¿vas a X ahora?" para viajes habituales/programados
-- aunque la app esté cerrada — antes de esto solo saltaba con la app
-- abierta mirando la pantalla, porque ese aviso vive en el navegador, no
-- en el servidor. Ver send-scheduled-trip-reminders.

-- Para no mandar el mismo aviso en cada tick del minuto mientras el viaje
-- siga dentro de la ventana de 30 min antes / 15 min después.
alter table recurring_trips add column if not exists last_reminded_date date;
alter table trips add column if not exists reminder_sent_at timestamptz;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- OJO: igual que el cron de suspend-low-rated-profiles, esto necesita la
-- service role key en la cabecera Authorization — se lee de un ajuste de
-- la propia base de datos (current_setting('app.settings.service_role_key')),
-- que ya debería estar configurado desde esa migración anterior. Si no lo
-- está, este cron también fallará con 401 hasta configurarlo:
--
--   alter database postgres set app.settings.service_role_key = 'LA_SERVICE_ROLE_KEY_REAL';

select cron.schedule(
  'send-scheduled-trip-reminders-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://kjfxkyhwghtlawobbukq.supabase.co/functions/v1/send-scheduled-trip-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
