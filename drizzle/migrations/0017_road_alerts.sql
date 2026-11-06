-- Avisos de carretera estilo Waze (radar, policía, accidente, obstáculo,
-- obras, atasco) que cualquier usuario puede dejar mientras navega, y que
-- se avisan a los demás cuando se acercan. Antes no había nada de esto —
-- solo la ruta y el tráfico que ya da Mapbox.
create table public.road_alerts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('radar', 'policia', 'accidente', 'obstaculo', 'obra', 'atasco')),
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now(),
  -- Caduca solo — un aviso de hace 4 horas ya no sirve de nada y confundiría
  -- más que ayudaría. Confirmarlo ("sigue ahí") alarga esto; descartarlo
  -- ("ya no está") lo caduca al momento.
  expires_at timestamptz not null,
  confirmations integer not null default 0
);

grant select, insert on public.road_alerts to authenticated;
grant all on public.road_alerts to service_role;

alter table public.road_alerts enable row level security;

create policy "cualquiera autenticado puede avisar de algo en la carretera"
  on public.road_alerts for insert to authenticated
  with check (creator_id = auth.uid());

create policy "los avisos de la carretera son visibles para todos"
  on public.road_alerts for select to authenticated
  using (true);

-- Confirmar/descartar no pasa por un UPDATE directo de la fila (cualquiera
-- podría entonces cambiarle el tipo o la posición a la de otro) — solo por
-- esta función, que únicamente toca confirmations/expires_at.
create or replace function public.confirm_road_alert(p_alert_id uuid, p_still_there boolean, p_extend_seconds integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_still_there then
    update public.road_alerts
    set confirmations = confirmations + 1,
        expires_at = greatest(expires_at, now() + make_interval(secs => p_extend_seconds))
    where id = p_alert_id;
  else
    update public.road_alerts
    set confirmations = confirmations - 1,
        expires_at = now()
    where id = p_alert_id;
  end if;
end;
$$;

grant execute on function public.confirm_road_alert(uuid, boolean, integer) to authenticated;
