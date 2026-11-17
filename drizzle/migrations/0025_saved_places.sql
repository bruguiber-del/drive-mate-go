CREATE TABLE public.saved_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('home', 'work', 'other')),
  icon text,
  label text NOT NULL,
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_places TO authenticated;
GRANT ALL ON public.saved_places TO service_role;

ALTER TABLE public.saved_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cada cual ve sus sitios guardados"
ON public.saved_places FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "cada cual guarda sus sitios"
ON public.saved_places FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "cada cual edita sus sitios guardados"
ON public.saved_places FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "cada cual borra sus sitios guardados"
ON public.saved_places FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE UNIQUE INDEX saved_places_one_home_per_user ON public.saved_places (user_id) WHERE kind = 'home';
CREATE UNIQUE INDEX saved_places_one_work_per_user ON public.saved_places (user_id) WHERE kind = 'work';