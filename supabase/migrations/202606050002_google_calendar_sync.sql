create table if not exists public.integration_account_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, provider)
);

alter table public.integration_account_tokens enable row level security;

drop trigger if exists integration_account_tokens_set_updated_at on public.integration_account_tokens;
create trigger integration_account_tokens_set_updated_at
  before update on public.integration_account_tokens
  for each row execute procedure public.set_updated_at();

alter table public.calendar_events_cache
  add column if not exists is_all_day boolean not null default false;
