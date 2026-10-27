-- Marca quién puede revisar manualmente las solicitudes de verificación que
-- la IA no supo resolver sola (verification_requests.status = 'needs_review').
-- Sin esto no hay forma de aprobar/rechazar esos casos — se quedarían
-- esperando para siempre.
alter table public.profiles
  add column is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'true solo para quien puede revisar a mano los documentos que la IA no logró verificar sola.';

update public.profiles
set is_admin = true
where id = (select id from auth.users where email = 'bruguiber@gmail.com');
