-- Radar de tramo (control de velocidad media en un tramo, no puntual) —
-- a petición del usuario, nuevo tipo junto al resto de avisos de
-- carretera. Necesita un dato que los demás tipos no tienen: cuántos km
-- dura el tramo controlado.
alter table public.road_alerts add column if not exists length_km double precision;

alter table public.road_alerts drop constraint if exists road_alerts_kind_check;
alter table public.road_alerts add constraint road_alerts_kind_check
  check (kind in ('radar', 'radar_tramo', 'policia', 'accidente', 'obstaculo', 'obra', 'atasco'));
