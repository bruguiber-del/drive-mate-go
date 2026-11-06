-- Guardar una suscripción push usa upsert (insert ... on conflict do update),
-- y la rama de actualización necesita permiso de UPDATE además de INSERT —
-- sin esto, renovar una suscripción ya existente (mismo endpoint) fallaba
-- en silencio: el navegador creía haberla guardado pero la fila no se
-- tocaba, y los avisos de prueba se perdían sin ningún error visible.
grant update on public.push_subscriptions to authenticated;
