create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null,
  trip_id uuid references public.trips(id) on delete set null,
  kind text not null check (kind in ('accidente', 'conductor', 'pasajero', 'otro')),
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

grant select, insert on public.reports to authenticated;
grant all on public.reports to service_role;

alter table public.reports enable row level security;

create policy "cualquiera autenticado puede denunciar"
  on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());

create policy "cada cual ve solo sus propias denuncias"
  on public.reports for select to authenticated
  using (reporter_id = auth.uid());

alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists suspension_reason text;