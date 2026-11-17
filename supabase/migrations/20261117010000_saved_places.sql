-- Sitios guardados (Casa, Trabajo, y otros con nombre e icono propios) —
-- para el acceso de un solo toque bajo "¿A dónde vas?" y como atajo en el
-- buscador, en vez de tener que escribir la misma dirección cada vez.
create table public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 'home'/'work' para el icono fijo de casa/maletín; 'other' para
  -- cualquier sitio con nombre e icono elegidos a mano (gimnasio...).
  kind text not null default 'other' check (kind in ('home', 'work', 'other')),
  -- Solo se usa cuando kind='other' — qué icono mostrar (ver el mismo
  -- catálogo corto en el frontend, SavedPlacesSheet.tsx).
  icon text,
  label text not null,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

-- A lo sumo una Casa y un Trabajo por persona — tiene sentido real (no vas
-- a tener dos casas guardadas a la vez) y evita que el icono fijo de abajo
-- del buscador no sepa a cuál de varias llevarte.
create unique index saved_places_one_home_per_user on public.saved_places (user_id) where kind = 'home';
create unique index saved_places_one_work_per_user on public.saved_places (user_id) where kind = 'work';

alter table public.saved_places enable row level security;

create policy "cada cual ve sus sitios guardados"
on public.saved_places for select to authenticated
using (user_id = auth.uid());

create policy "cada cual guarda sus sitios"
on public.saved_places for insert to authenticated
with check (user_id = auth.uid());

create policy "cada cual edita sus sitios guardados"
on public.saved_places for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "cada cual borra sus sitios guardados"
on public.saved_places for delete to authenticated
using (user_id = auth.uid());
