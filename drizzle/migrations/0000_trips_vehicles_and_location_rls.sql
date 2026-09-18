-- 1. trips table
CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  passenger_id uuid,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their trips"
  ON public.trips FOR SELECT TO authenticated
  USING (auth.uid() = driver_id OR auth.uid() = passenger_id);

CREATE POLICY "Drivers can create their trips"
  ON public.trips FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Participants can update their trips"
  ON public.trips FOR UPDATE TO authenticated
  USING (auth.uid() = driver_id OR auth.uid() = passenger_id)
  WITH CHECK (auth.uid() = driver_id OR auth.uid() = passenger_id);

CREATE POLICY "Drivers can delete their trips"
  ON public.trips FOR DELETE TO authenticated
  USING (auth.uid() = driver_id);

CREATE INDEX idx_trips_driver_id ON public.trips(driver_id);
CREATE INDEX idx_trips_passenger_id ON public.trips(passenger_id);

-- 2. vehicles table
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  brand text NOT NULL,
  model text NOT NULL,
  year integer NOT NULL,
  license_plate text NOT NULL,
  fuel_type text NOT NULL,
  category text NOT NULL,
  estimated_consumption double precision NOT NULL DEFAULT 0,
  cost_per_km double precision NOT NULL DEFAULT 0,
  verification_status text NOT NULL DEFAULT 'unverified',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their vehicles"
  ON public.vehicles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their vehicles"
  ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their vehicles"
  ON public.vehicles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their vehicles"
  ON public.vehicles FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_vehicles_user_id ON public.vehicles(user_id);

-- 3. Restrict driver_locations to trip participants
DROP POLICY IF EXISTS "Anyone can view driver locations" ON public.driver_locations;
DROP POLICY IF EXISTS "Drivers can insert their locations" ON public.driver_locations;
DROP POLICY IF EXISTS "Allow delete of locations" ON public.driver_locations;

REVOKE ALL ON public.driver_locations FROM anon;
GRANT SELECT, INSERT, DELETE ON public.driver_locations TO authenticated;
GRANT ALL ON public.driver_locations TO service_role;

CREATE POLICY "Trip participants can view locations"
  ON public.driver_locations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = driver_locations.trip_id
      AND (t.driver_id = auth.uid() OR t.passenger_id = auth.uid())
  ));

CREATE POLICY "Trip drivers can insert locations"
  ON public.driver_locations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = driver_locations.trip_id
      AND (t.driver_id = auth.uid() OR t.passenger_id = auth.uid())
  ));

CREATE POLICY "Trip participants can delete locations"
  ON public.driver_locations FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = driver_locations.trip_id
      AND (t.driver_id = auth.uid() OR t.passenger_id = auth.uid())
  ));
