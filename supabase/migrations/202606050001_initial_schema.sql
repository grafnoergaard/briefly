create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  locale text default 'da-DK',
  timezone text default 'Europe/Copenhagen',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.family_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.family_group_members (
  id uuid primary key default gen_random_uuid(),
  family_group_id uuid not null references public.family_groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member', 'child')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (family_group_id, profile_id)
);

create table if not exists public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  provider_account_id text,
  scopes text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'revoked')),
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, provider)
);

create table if not exists public.calendar_events_cache (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  family_group_id uuid references public.family_groups(id) on delete set null,
  provider text not null default 'google_calendar',
  external_id text not null,
  calendar_id text not null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, provider, external_id)
);

create table if not exists public.tasks_cache (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'google_tasks',
  external_id text not null,
  task_list_id text,
  title text not null,
  notes text,
  due_at timestamptz,
  completed_at timestamptz,
  status text not null default 'needsAction',
  priority_score integer,
  payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, provider, external_id)
);

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  family_group_id uuid not null references public.family_groups(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  label text not null,
  quantity text,
  category text,
  is_completed boolean not null default false,
  meal_plan_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  family_group_id uuid not null references public.family_groups(id) on delete cascade,
  planned_for date not null,
  title text not null,
  notes text,
  recipe_source text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (family_group_id, planned_for)
);

alter table public.shopping_items
  add constraint shopping_items_meal_plan_id_fkey
  foreign key (meal_plan_id) references public.meal_plans(id) on delete set null;

create table if not exists public.activity_feed (
  id uuid primary key default gen_random_uuid(),
  family_group_id uuid not null references public.family_groups(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ai_briefings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  family_group_id uuid references public.family_groups(id) on delete set null,
  briefing_type text not null check (briefing_type in ('morning', 'evening', 'weekly', 'family')),
  model text,
  summary text not null,
  prompt_snapshot jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.integration_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  job_type text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'success', 'error')),
  cursor text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists family_groups_set_updated_at on public.family_groups;
create trigger family_groups_set_updated_at
  before update on public.family_groups
  for each row execute procedure public.set_updated_at();

drop trigger if exists integration_accounts_set_updated_at on public.integration_accounts;
create trigger integration_accounts_set_updated_at
  before update on public.integration_accounts
  for each row execute procedure public.set_updated_at();

drop trigger if exists calendar_events_cache_set_updated_at on public.calendar_events_cache;
create trigger calendar_events_cache_set_updated_at
  before update on public.calendar_events_cache
  for each row execute procedure public.set_updated_at();

drop trigger if exists tasks_cache_set_updated_at on public.tasks_cache;
create trigger tasks_cache_set_updated_at
  before update on public.tasks_cache
  for each row execute procedure public.set_updated_at();

drop trigger if exists shopping_items_set_updated_at on public.shopping_items;
create trigger shopping_items_set_updated_at
  before update on public.shopping_items
  for each row execute procedure public.set_updated_at();

drop trigger if exists meal_plans_set_updated_at on public.meal_plans;
create trigger meal_plans_set_updated_at
  before update on public.meal_plans
  for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.family_groups enable row level security;
alter table public.family_group_members enable row level security;
alter table public.integration_accounts enable row level security;
alter table public.calendar_events_cache enable row level security;
alter table public.tasks_cache enable row level security;
alter table public.shopping_items enable row level security;
alter table public.meal_plans enable row level security;
alter table public.activity_feed enable row level security;
alter table public.ai_briefings enable row level security;
alter table public.integration_sync_jobs enable row level security;

create or replace function public.is_family_member(group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_group_members fgm
    where fgm.family_group_id = group_id
      and fgm.profile_id = auth.uid()
  );
$$;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "family_groups_member_access"
  on public.family_groups for select
  using (public.is_family_member(id) or owner_id = auth.uid());

create policy "family_groups_owner_manage"
  on public.family_groups for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "family_group_members_member_access"
  on public.family_group_members for select
  using (public.is_family_member(family_group_id));

create policy "family_group_members_owner_manage"
  on public.family_group_members for all
  using (
    exists (
      select 1 from public.family_groups fg
      where fg.id = family_group_id
        and fg.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.family_groups fg
      where fg.id = family_group_id
        and fg.owner_id = auth.uid()
    )
  );

create policy "integration_accounts_own"
  on public.integration_accounts for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "calendar_events_cache_own_or_family"
  on public.calendar_events_cache for select
  using (profile_id = auth.uid() or public.is_family_member(family_group_id));

create policy "calendar_events_cache_own_write"
  on public.calendar_events_cache for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "tasks_cache_own"
  on public.tasks_cache for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "shopping_items_family_access"
  on public.shopping_items for select
  using (public.is_family_member(family_group_id));

create policy "shopping_items_family_write"
  on public.shopping_items for all
  using (public.is_family_member(family_group_id))
  with check (public.is_family_member(family_group_id));

create policy "meal_plans_family_access"
  on public.meal_plans for select
  using (public.is_family_member(family_group_id));

create policy "meal_plans_family_write"
  on public.meal_plans for all
  using (public.is_family_member(family_group_id))
  with check (public.is_family_member(family_group_id));

create policy "activity_feed_family_access"
  on public.activity_feed for select
  using (public.is_family_member(family_group_id));

create policy "activity_feed_family_write"
  on public.activity_feed for insert
  with check (public.is_family_member(family_group_id));

create policy "ai_briefings_own_or_family"
  on public.ai_briefings for select
  using (
    profile_id = auth.uid()
    or public.is_family_member(family_group_id)
  );

create policy "ai_briefings_own_write"
  on public.ai_briefings for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "integration_sync_jobs_own"
  on public.integration_sync_jobs for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
