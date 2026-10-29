-- El emparejamiento real no funcionaba sin esto: un pasajero podía pedir
-- subirse, cancelarla y borrarla, pero NO leer su propia fila — la única
-- política SELECT de trip_passengers era la del conductor. Así que nunca
-- podía ver si le habían aceptado o rechazado (y el tiempo real solo
-- entrega filas que el suscriptor puede leer).
create policy "un pasajero real ve su propia petición"
  on public.trip_passengers for select to authenticated
  using (passenger_id = auth.uid());