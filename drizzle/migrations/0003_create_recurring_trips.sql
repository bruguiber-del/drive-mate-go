create table public.recurring_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_name text not null,
  destination_lat double precision not null,
  destination_lng double precision not null,
  origin_name text,
  origin_lat double precision,
  origin_lng double precision,
  departure_time text not null,
  days_of_week integer[] not null,
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

grant select, insert, update, delete on public.recurring_trips to authenticated;
grant all on public.recurring_trips to service_role;
