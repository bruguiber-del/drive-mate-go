alter table public.saved_places add column position integer not null default 0;

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