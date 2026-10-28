-- Base para el emparejamiento real pasajero-conductor. Antes de esto, el
-- "pasajero" y el "conductor" del otro lado eran siempre simulados — ahora
-- un conductor real puede ser descubierto por un pasajero real, pedirle
-- subir, y que el conductor acepte de verdad.

-- 1. Descubrimiento: posición aproximada + destino del conductor mientras
-- el viaje está activo. A propósito SEPARADO de driver_locations (esa
-- tabla se queda restringida a los participantes, para el trayecto en vivo
-- ya emparejados) — aquí solo hace falta UN punto aproximado, visible para
-- cualquiera que esté buscando, igual que cualquier app de este tipo
-- enseña conductores cercanos antes de que exista ningún viaje en común.
alter table public.trips
  add column driver_lat double precision,
  add column driver_lng double precision,
  add column destination_lat double precision,
  add column destination_lng double precision,
  add column destination_name text,
  add column free_seats integer,
  add column location_updated_at timestamptz;

create policy "cualquiera autenticado descubre viajes activos"
  on public.trips for select to authenticated
  using (status = 'active');

-- 2. trip_passengers gana un estado nuevo en el flujo: 'requested' (el
-- pasajero lo pidió, el conductor todavía no ha dicho nada) antes de pasar
-- a 'waiting_pickup' (aceptado) — no hace falta tocar el check de status,
-- es texto libre.
create policy "un pasajero real pide subirse a un viaje activo"
  on public.trip_passengers for insert to authenticated
  with check (
    passenger_id = auth.uid()
    and status = 'requested'
    and exists (select 1 from public.trips t where t.id = trip_id and t.status = 'active')
  );

create policy "un pasajero real cancela su propia petición pendiente"
  on public.trip_passengers for update to authenticated
  using (passenger_id = auth.uid() and status = 'requested')
  with check (passenger_id = auth.uid() and status = 'cancelled');

create policy "un pasajero real borra su propia petición pendiente"
  on public.trip_passengers for delete to authenticated
  using (passenger_id = auth.uid() and status = 'requested');

-- 3. Tiempo real: sin esto, ni el conductor ve llegar la petición nueva ni
-- el pasajero ve que se la han aceptado/rechazado — ambos tendrían que
-- refrescar la pantalla a mano.
alter table public.trips replica identity full;
alter table public.trip_passengers replica identity full;
alter publication supabase_realtime add table public.trips;
alter publication supabase_realtime add table public.trip_passengers;
