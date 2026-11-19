-- Orden propio para los sitios guardados — antes salían siempre casa/
-- trabajo primero y el resto por fecha de creación, sin forma de cambiar
-- ese orden (p. ej. poner "trabajo" delante de "casa" un día que toque).
alter table public.saved_places add column position integer not null default 0;

-- Conserva el orden que ya se veía (casa/trabajo primero, luego el resto
-- por fecha) como punto de partida, antes de que nadie haya reordenado
-- nada a mano todavía.
with ranked as (
  select id, row_number() over (
    partition by user_id
    order by case kind when 'home' then 0 when 'work' then 1 else 2 end, created_at
  ) - 1 as rn
  from public.saved_places
)
update public.saved_places sp
set position = ranked.rn
from ranked
where sp.id = ranked.id;
