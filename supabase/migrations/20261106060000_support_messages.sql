-- Mensajes a soporte (desde Ayuda, o automáticos cuando algo se cae) —
-- antes los botones de "Chat"/"Llamar"/"Email" en Ayuda no hacían nada al
-- pulsarlos, y un fallo real de la app (ErrorBoundary) no tenía forma de
-- avisar a nadie salvo que la persona afectada lo contara por su cuenta.
--
-- Sin políticas de cliente a propósito — todo pasa por la función
-- contact-support, que inserta con la service role; así cubre también a
-- quien todavía no ha iniciado sesión (p. ej. un fallo justo al abrir la
-- app, antes de loguearse).
create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  message text not null,
  context text,
  created_at timestamptz not null default now()
);

grant all on public.support_messages to service_role;
alter table public.support_messages enable row level security;
