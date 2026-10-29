-- La política de driver_locations solo reconocía como "participante" al
-- pasajero guardado en trips.passenger_id — eso solo existe en el viaje de
-- autocobro de prueba. Con el emparejamiento real, el pasajero vive en
-- trip_passengers (puede haber varios por viaje), así que nunca pasaba el
-- EXISTS y el pasajero real se quedaba sin ver la ubicación en vivo del
-- conductor (ni la inicial ni la de tiempo real).

DROP POLICY IF EXISTS "Trip participants can view locations" ON public.driver_locations;
CREATE POLICY "Trip participants can view locations"
  ON public.driver_locations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = driver_locations.trip_id
      AND (
        t.driver_id = auth.uid()
        OR t.passenger_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.trip_passengers tp
          WHERE tp.trip_id = t.id AND tp.passenger_id = auth.uid()
        )
      )
  ));

DROP POLICY IF EXISTS "Trip participants can delete locations" ON public.driver_locations;
CREATE POLICY "Trip participants can delete locations"
  ON public.driver_locations FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = driver_locations.trip_id
      AND (
        t.driver_id = auth.uid()
        OR t.passenger_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.trip_passengers tp
          WHERE tp.trip_id = t.id AND tp.passenger_id = auth.uid()
        )
      )
  ));