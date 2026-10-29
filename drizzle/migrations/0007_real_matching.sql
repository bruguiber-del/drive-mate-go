-- Base para el emparejamiento real pasajero-conductor.

-- 0. passenger_id: el pasajero real de cada tramo (antes solo existía passenger_name, texto suelto).
--    Las políticas nuevas de abajo lo usan, así que se crea aquí.
alter table public.trip_passengers
  add column if not exists passenger_id uuid;

comment on column public.trip_passengers.passenger_id is 'Pasajero real que pidió subirse (auth.users.id). Null en tramos sin pasajero asignado.';

create index if not exists trip_passengers_passenger_id_idx
  on public.trip_passengers (passenger_id);

-- 1. Descubrimiento: posición aproximada + destino del conductor mientras
--    el viaje está activo. SEPARADO de driver_locations (esa tabla se queda
--    restringida a los participantes ya emparejados).
alter table public.trips add column if not exists driver_lat double precision;
alter table public.trips add column if not exists driver_lng double precision;
alter table public.trips add column if not exists destination_lat double precision;
alter table public.trips add column if not exists destination_lng double precision;
alter table public.trips add column if not exists destination_name text;
alter table public.trips add column if not exists free_seats integer;
alter table public.trips add column if not exists location_updated_at timestamptz;

create policy "cualquiera autenticado descubre viajes activos"
  on public.trips for select to authenticated
  using (status = 'active');

-- 2. trip_passengers gana los estados 'requested' (el pasajero lo pidió) y
--    'cancelled' (lo canceló antes de que el conductor dijera nada).
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

-- 3. Tiempo real: sin esto, ni el conductor ve llegar la petición ni el
--    pasajero ve que se la han aceptado/rechazado.
alter table public.trips replica identity full;
alter table public.trip_passengers replica identity full;
alter publication supabase_realtime add table public.trips;
alter publication supabase_realtime add table public.trip_passengers;