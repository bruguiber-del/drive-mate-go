-- Programa la función suspend-low-rated-profiles para que se lance sola
-- cada lunes a las 3:00 — antes habría hecho falta entrar a mano cada
-- semana a comprobar medias de valoración, algo que nadie iba a hacer de
-- verdad con regularidad.
--
-- OJO: la llamada necesita la service role key en la cabecera Authorization
-- para que la función (que exige estar autenticado... en realidad esta no
-- exige sesión, pero sí usa la service role internamente) se pueda
-- invocar sin usuario real detrás. Esa clave NUNCA va en esta migración ni
-- en el repositorio — se lee de un ajuste de la propia base de datos que
-- hay que configurar aparte, una sola vez, directamente en Supabase:
--
--   alter database postgres set app.settings.service_role_key = 'LA_SERVICE_ROLE_KEY_REAL';
--
-- Sin ese paso, el cron se queda programado pero cada ejecución fallará
-- (401) hasta que se configure.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'suspend-low-rated-weekly',
  '0 3 * * 1',
  $$
  select net.http_post(
    url := 'https://kjfxkyhwghtlawobbukq.supabase.co/functions/v1/suspend-low-rated-profiles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
