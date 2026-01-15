-- Create table for real-time driver location tracking
CREATE TABLE public.driver_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL,
  driver_id TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast lookups by trip_id
CREATE INDEX idx_driver_locations_trip_id ON public.driver_locations(trip_id);

-- Create index for ordering by time
CREATE INDEX idx_driver_locations_created_at ON public.driver_locations(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

-- Create policies - allow anyone to read locations (for active trips)
-- In production, this should be more restrictive based on trip participants
CREATE POLICY "Anyone can view driver locations" 
ON public.driver_locations 
FOR SELECT 
USING (true);

-- Allow anyone to insert locations (demo mode - in production, should verify driver)
CREATE POLICY "Drivers can insert their locations" 
ON public.driver_locations 
FOR INSERT 
WITH CHECK (true);

-- Allow cleanup of old locations
CREATE POLICY "Allow delete of locations" 
ON public.driver_locations 
FOR DELETE 
USING (true);

-- Enable realtime for this table
ALTER TABLE public.driver_locations REPLICA IDENTITY FULL;

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;

-- Create a function to get latest driver location for a trip
CREATE OR REPLACE FUNCTION public.get_latest_driver_location(p_trip_id UUID)
RETURNS TABLE(
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE
) 
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT latitude, longitude, heading, speed, created_at
  FROM public.driver_locations
  WHERE trip_id = p_trip_id
  ORDER BY created_at DESC
  LIMIT 1;
$$;

-- Create a function to get position history for trail drawing
CREATE OR REPLACE FUNCTION public.get_driver_position_history(p_trip_id UUID, p_limit INTEGER DEFAULT 30)
RETURNS TABLE(
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE
) 
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT latitude, longitude, created_at
  FROM public.driver_locations
  WHERE trip_id = p_trip_id
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;