alter table public.shopping_items
  add column if not exists sort_index integer not null default 0;

with ranked_items as (
  select
    id,
    row_number() over (
      partition by family_group_id, is_completed
      order by created_at asc, id asc
    ) * 100 as next_sort_index
  from public.shopping_items
)
update public.shopping_items shopping_items
set sort_index = ranked_items.next_sort_index
from ranked_items
where shopping_items.id = ranked_items.id
  and shopping_items.sort_index = 0;

create index if not exists shopping_items_family_group_sort_idx
  on public.shopping_items (family_group_id, is_completed, sort_index);
