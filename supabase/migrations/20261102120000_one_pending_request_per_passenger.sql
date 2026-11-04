-- Un pasajero no puede tener más de una petición activa a la vez — antes
-- nada lo impedía a nivel de base de datos (solo una comprobación en el
-- cliente, que no protege de varias pestañas/dispositivos a la vez ni de
-- quien llame directo a la API). Reemplaza la política de insert, no
-- añade una nueva: dos políticas permisivas para el mismo comando se unen
-- con OR, así que una política nueva más estricta sola no restringiría nada.
--
-- La política anterior se consultaba a sí misma (trip_passengers dentro del
-- check de trip_passengers) y Postgres la rechazaba con recursión infinita
-- (42P17): cualquier intento de pedir un viaje fallaba, no solo los
-- duplicados. La comprobación se mueve a una función SECURITY DEFINER, que
-- lee la tabla sin pasar por RLS y rompe el ciclo.

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
