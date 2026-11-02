-- La política anterior se consultaba a sí misma (trip_passengers dentro del
-- check de trip_passengers) y Postgres la rechazaba con recursión infinita
-- (42P17): cualquier intento de pedir un viaje fallaba. La comprobación se
-- mueve a una función SECURITY DEFINER, que lee la tabla sin pasar por RLS.

create or replace function public.passenger_has_active_request(p_passenger uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_passengers
    where passenger_id = p_passenger
      and status in ('requested', 'waiting_pickup')
  )
$$;

grant execute on function public.passenger_has_active_request(uuid) to authenticated;

drop policy if exists "un pasajero real pide subirse a un viaje activo" on public.trip_passengers;

create policy "un pasajero real pide subirse a un viaje activo"
  on public.trip_passengers for insert to authenticated
  with check (
    passenger_id = auth.uid()
    and status = 'requested'
    and exists (select 1 from public.trips t where t.id = trip_id and t.status = 'active')
    and not public.passenger_has_active_request(auth.uid())
  );