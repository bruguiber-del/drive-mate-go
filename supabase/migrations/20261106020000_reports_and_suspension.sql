-- Botón SOS: denunciar un accidente o el mal comportamiento de alguien del
-- viaje, para que un problemático no siga apareciendo sin más. Antes no
-- había ninguna forma de avisar de esto salvo contactar fuera de la app.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  -- Puede quedar sin rellenar (p. ej. "accidente" sin señalar a nadie en
  -- concreto) — no todo SOS acusa a una persona.
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

-- Nadie debería poder leer denuncias ajenas desde el cliente — solo el
-- propio denunciante (para ver el estado de las suyas) o un admin (vía
-- service role, que ya se salta RLS). Revisarlas de verdad se hace desde
-- el panel de admin, con la service role key, no con esta política.
create policy "cada cual ve solo sus propias denuncias"
  on public.reports for select to authenticated
  using (reporter_id = auth.uid());

-- Suspensión de cuenta por valoración media baja (o a mano por un admin
-- tras revisar una denuncia) — antes no había ningún mecanismo para
-- apartar a alguien problemático, por mucho que la comunidad lo valorara
-- mal una y otra vez.
alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists suspension_reason text;
