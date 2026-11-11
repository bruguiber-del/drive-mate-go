-- La política de INSERT de driver_locations se quedó desde el principio en
-- "WITH CHECK (true)" sin ningún "TO authenticated" — una auditoría la
-- encontró: cualquiera, ni falta hacía estar logueado, podía insertar
-- ubicaciones falsas en el trip_id que quisiera (adivinado o visto en la
-- app), suplantando al conductor de cara a los pasajeros de ese viaje. El
-- SELECT y el DELETE ya se habían corregido en 20261029140000; el INSERT
-- se quedó fuera por descuido.
drop policy if exists "Drivers can insert their locations" on public.driver_locations;

create policy "Solo el conductor del viaje inserta su propia ubicación"
  on public.driver_locations for insert to authenticated
  with check (
    driver_id = auth.uid()::text
    and exists (
      select 1 from public.trips t
      where t.id = driver_locations.trip_id and t.driver_id = auth.uid()
    )
  );
