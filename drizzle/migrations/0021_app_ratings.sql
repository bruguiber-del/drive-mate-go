create table public.app_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
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