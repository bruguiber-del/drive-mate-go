-- Valoración de la app en sí (no de un conductor/pasajero concreto) — hasta
-- ahora se recogía en RatingModal pero solo se dejaba constancia en
-- console.info, sin guardarse en ningún sitio. trip_id es opcional porque,
-- a diferencia de las valoraciones de persona a persona, esta no tiene por
-- qué venir siempre de un viaje recién terminado.
create table public.app_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  stars smallint not null check (stars between 1 and 5),
  review text,
  created_at timestamptz not null default now()
);

grant select, insert on public.app_ratings to authenticated;
grant all on public.app_ratings to service_role;

alter table public.app_ratings enable row level security;

create policy "cada usuario guarda y ve sus propias valoraciones de la app"
  on public.app_ratings for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index idx_app_ratings_user_id on public.app_ratings(user_id);
