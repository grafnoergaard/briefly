create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  family_group_id uuid not null references public.family_groups(id) on delete cascade,
  name text not null,
  slug text not null,
  is_primary boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (family_group_id, slug)
);

create unique index if not exists shopping_lists_one_primary_per_family_idx
  on public.shopping_lists (family_group_id)
  where is_primary = true;

alter table public.shopping_items
  add column if not exists sort_index integer not null default 0;

alter table public.shopping_items
  add column if not exists shopping_list_id uuid references public.shopping_lists(id) on delete cascade;

insert into public.shopping_lists (family_group_id, name, slug, is_primary, created_by)
select
  family_groups.id,
  'Household',
  'household',
  true,
  family_groups.owner_id
from public.family_groups
where not exists (
  select 1
  from public.shopping_lists
  where shopping_lists.family_group_id = family_groups.id
    and shopping_lists.is_primary = true
);

update public.shopping_items
set shopping_list_id = primary_lists.id
from public.shopping_lists as primary_lists
where shopping_items.family_group_id = primary_lists.family_group_id
  and primary_lists.is_primary = true
  and shopping_items.shopping_list_id is null;

with ranked_items as (
  select
    id,
    row_number() over (
      partition by family_group_id, is_completed, shopping_list_id
      order by created_at asc, id asc
    ) * 100 as next_sort_index
  from public.shopping_items
)
update public.shopping_items shopping_items
set sort_index = ranked_items.next_sort_index
from ranked_items
where shopping_items.id = ranked_items.id
  and shopping_items.sort_index = 0;

alter table public.shopping_items
  alter column shopping_list_id set not null;

create index if not exists shopping_items_list_sort_idx
  on public.shopping_items (shopping_list_id, is_completed, sort_index);

drop trigger if exists shopping_lists_set_updated_at on public.shopping_lists;
create trigger shopping_lists_set_updated_at
  before update on public.shopping_lists
  for each row execute function public.set_updated_at();

alter table public.shopping_lists enable row level security;

create policy "shopping_lists_family_access"
  on public.shopping_lists for select
  using (exists (
    select 1
    from public.family_group_members
    where family_group_members.family_group_id = shopping_lists.family_group_id
      and family_group_members.profile_id = auth.uid()
  ));

create policy "shopping_lists_family_write"
  on public.shopping_lists for all
  using (exists (
    select 1
    from public.family_group_members
    where family_group_members.family_group_id = shopping_lists.family_group_id
      and family_group_members.profile_id = auth.uid()
  ))
  with check (exists (
    select 1
    from public.family_group_members
    where family_group_members.family_group_id = shopping_lists.family_group_id
      and family_group_members.profile_id = auth.uid()
  ));
