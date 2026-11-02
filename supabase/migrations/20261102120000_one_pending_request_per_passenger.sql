-- Un pasajero no puede tener más de una petición activa a la vez — antes
-- nada lo impedía a nivel de base de datos (solo una comprobación en el
-- cliente, que no protege de varias pestañas/dispositivos a la vez ni de
-- quien llame directo a la API). Reemplaza la política de insert, no
-- añade una nueva: dos políticas permisivas para el mismo comando se unen
-- con OR, así que una política nueva más estricta sola no restringiría nada.

drop policy if exists "un pasajero real pide subirse a un viaje activo" on public.trip_passengers;

create policy "un pasajero real pide subirse a un viaje activo"
  on public.trip_passengers for insert to authenticated
  with check (
    passenger_id = auth.uid()
    and status = 'requested'
    and exists (select 1 from public.trips t where t.id = trip_id and t.status = 'active')
    and not exists (
      select 1 from public.trip_passengers tp
      where tp.passenger_id = auth.uid()
        and tp.status in ('requested', 'waiting_pickup')
    )
  );
