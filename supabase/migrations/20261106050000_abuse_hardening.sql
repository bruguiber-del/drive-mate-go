-- Endurece dos huecos de abuso detectados en una auditoría: una cuenta
-- suspendida podía seguir mandando denuncias SOS o avisos de carretera
-- falsos sin ninguna restricción, y nada impedía denunciar a cualquier
-- usuario sin haber compartido coche nunca con él/ella, ni dejar varios
-- avisos de carretera pegados en el mismo sitio.

-- ── Avisos de carretera: 1 por usuario cada 500m, y nada si está suspendido ──

-- Distancia en metros entre dos puntos (fórmula del haversino) — usada solo
-- para decidir si ya tienes un aviso tuyo demasiado cerca, no hace falta
-- más precisión que esta aproximación esférica.
create or replace function public.has_nearby_road_alert(p_user uuid, p_lat double precision, p_lng double precision, p_radius_m double precision)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.road_alerts ra
    where ra.creator_id = p_user
      and ra.expires_at > now()
      and (
        6371000 * acos(
          least(1, greatest(-1,
            cos(radians(p_lat)) * cos(radians(ra.lat)) * cos(radians(ra.lng) - radians(p_lng))
            + sin(radians(p_lat)) * sin(radians(ra.lat))
          ))
        )
      ) < p_radius_m
  );
$$;

grant execute on function public.has_nearby_road_alert(uuid, double precision, double precision, double precision) to authenticated;

drop policy if exists "cualquiera autenticado puede avisar de algo en la carretera" on public.road_alerts;

create policy "cualquiera autenticado puede avisar de algo en la carretera"
  on public.road_alerts for insert to authenticated
  with check (
    creator_id = auth.uid()
    and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.suspended_at is not null)
    and not public.has_nearby_road_alert(auth.uid(), lat, lng, 500)
  );

-- ── Denuncias SOS: solo entre quien ha compartido viaje de verdad, y nada
--    si quien denuncia está suspendido — mismo criterio que ya aplica
--    submit-report, aquí también a nivel de base de datos por si alguien
--    se salta la función e inserta directo.
create or replace function public.have_shared_trip(p_user uuid, p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trips t
    join public.trip_passengers tp on tp.trip_id = t.id
    where (t.driver_id = p_user and tp.passenger_id = p_other)
       or (t.driver_id = p_other and tp.passenger_id = p_user)
  );
$$;

grant execute on function public.have_shared_trip(uuid, uuid) to authenticated;

drop policy if exists "cualquiera autenticado puede denunciar" on public.reports;

create policy "cualquiera autenticado puede denunciar"
  on public.reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.suspended_at is not null)
    and (reported_user_id is null or public.have_shared_trip(auth.uid(), reported_user_id))
  );
