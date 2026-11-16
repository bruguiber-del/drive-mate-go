DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "las valoraciones de alguien son visibles para calcular su media" ON public.ratings;
CREATE POLICY "cada cual ve las valoraciones que hizo o recibió" ON public.ratings FOR SELECT TO authenticated USING (rater_id = auth.uid() OR rated_user_id = auth.uid());