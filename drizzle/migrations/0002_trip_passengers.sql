-- One trip can now carry several passengers at once (up to the driver's
-- seats) instead of a new `trips` row per accepted passenger. `trips` stays
-- one row per DRIVING SESSION (driver_id + overall origin/destination);
-- each passenger riding along in that session gets its own row here.
CREATE TABLE public.trip_passengers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  passenger_id uuid,
  passenger_name text NOT NULL,
  origin_name text,
  origin_lat double precision,
  origin_lng double precision,
  destination_name text,
  destination_lat double precision,
  destination_lng double precision,
  price numeric,
  status text NOT NULL DEFAULT 'waiting_pickup',
  picked_up_at timestamptz,
  dropped_off_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_passengers TO authenticated;
GRANT ALL ON public.trip_passengers TO service_role;

ALTER TABLE public.trip_passengers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip participants can view trip passengers"
  ON public.trip_passengers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_passengers.trip_id
      AND (t.driver_id = auth.uid() OR trip_passengers.passenger_id = auth.uid())
  ));

CREATE POLICY "Trip drivers can add passengers to their trip"
  ON public.trip_passengers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_passengers.trip_id AND t.driver_id = auth.uid()
  ));

CREATE POLICY "Trip drivers can update passenger status"
  ON public.trip_passengers FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_passengers.trip_id AND t.driver_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_passengers.trip_id AND t.driver_id = auth.uid()
  ));

CREATE POLICY "Trip drivers can remove passengers"
  ON public.trip_passengers FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_passengers.trip_id AND t.driver_id = auth.uid()
  ));

CREATE INDEX idx_trip_passengers_trip_id ON public.trip_passengers(trip_id);
