create table public.recurring_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_name text not null,
  destination_lat double precision not null,
  destination_lng double precision not null,
  -- Null = recoger desde la ubicación real en el momento de salir, no un
  -- punto fijo guardado.
  origin_name text,
  origin_lat double precision,
  origin_lng double precision,
  departure_time text not null, -- 'HH:MM', hora local del dispositivo
  days_of_week integer[] not null, -- 0=domingo .. 6=sábado
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.recurring_trips enable row level security;

create policy "el conductor ve sus viajes habituales"
on public.recurring_trips for select to authenticated
using (user_id = auth.uid());

create policy "el conductor crea sus viajes habituales"
on public.recurring_trips for insert to authenticated
with check (user_id = auth.uid());

create policy "el conductor edita sus viajes habituales"
on public.recurring_trips for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "el conductor borra sus viajes habituales"
on public.recurring_trips for delete to authenticated
using (user_id = auth.uid());
