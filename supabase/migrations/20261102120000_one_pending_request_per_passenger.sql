-- Un pasajero no puede tener más de una petición activa a la vez — antes
-- nada lo impedía a nivel de base de datos (solo una comprobación en el
-- cliente, que no protege de varias pestañas/dispositivos a la vez ni de
-- quien llame directo a la API). Reemplaza la política de insert, no
-- añade una nueva: dos políticas permisivas para el mismo comando se unen
-- con OR, así que una política nueva más estricta sola no restringiría nada.
--
-- La comprobación "¿ya tiene otra petición pendiente?" va en una función
-- aparte, no como subconsulta directa dentro del with check: consultar
-- trip_passengers desde dentro de su propia política de insert reevalúa
-- las políticas de select de esa misma tabla, y eso entra en recursión
-- infinita contra la política de select ya existente — Postgres rechaza
-- TODAS las inserciones (no solo las duplicadas) con un error de
-- recursión. SECURITY DEFINER hace que la función consulte la tabla sin
-- pasar por RLS, rompiendo el ciclo.

create or replace function public.passenger_has_pending_request(p_passenger_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trip_passengers tp
    where tp.passenger_id = p_passenger_id
      and tp.status in ('requested', 'waiting_pickup')
  );
$$;

drop policy if exists "un pasajero real pide subirse a un viaje activo" on public.trip_passengers;

create policy "un pasajero real pide subirse a un viaje activo"
  on public.trip_passengers for insert to authenticated
  with check (
    passenger_id = auth.uid()
    and status = 'requested'
    and exists (select 1 from public.trips t where t.id = trip_id and t.status = 'active')
    and not public.passenger_has_pending_request(auth.uid())
  );
