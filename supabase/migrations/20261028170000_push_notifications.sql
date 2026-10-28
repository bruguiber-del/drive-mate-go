-- Sin esto, enterarse de una petición nueva o de que te han aceptado
-- dependía de tener la app abierta y mirando la pantalla (el aviso sonoro
-- que ya existe no suena si el móvil está bloqueado o en otra pestaña).
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

grant select, insert, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

alter table public.push_subscriptions enable row level security;

create policy "cada usuario gestiona sus propias suscripciones push"
  on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index idx_push_subscriptions_user_id on public.push_subscriptions(user_id);
