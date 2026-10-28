-- Las valoraciones con estrellas al terminar un viaje se recogían en el
-- modal pero se descartaban del todo — solo salía un "gracias" en
-- pantalla. Ahora se guardan de verdad y mantienen profiles.average_rating
-- al día automáticamente.
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  rater_id uuid not null references auth.users(id) on delete cascade,
  rated_user_id uuid not null references auth.users(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  review text,
  created_at timestamptz not null default now(),
  unique (trip_id, rater_id, rated_user_id)
);

grant select, insert on public.ratings to authenticated;
grant all on public.ratings to service_role;

alter table public.ratings enable row level security;

create policy "participantes valoran a otros participantes de su viaje"
  on public.ratings for insert to authenticated
  with check (
    rater_id = auth.uid()
    and exists (
      select 1 from public.trips t
      where t.id = trip_id
        and (
          t.driver_id = auth.uid()
          or exists (select 1 from public.trip_passengers tp where tp.trip_id = t.id and tp.passenger_id = auth.uid())
        )
    )
  );

-- Pública (no solo del propio viaje) para que cualquiera pueda ver la
-- media de alguien antes de emparejarse con él/ella.
create policy "las valoraciones de alguien son visibles para calcular su media"
  on public.ratings for select to authenticated
  using (true);

create or replace function public.update_average_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set average_rating = (
    select round(avg(stars)::numeric, 1) from public.ratings where rated_user_id = new.rated_user_id
  )
  where id = new.rated_user_id;
  return new;
end;
$$;

create trigger ratings_update_average_rating
  after insert on public.ratings
  for each row execute function public.update_average_rating();
