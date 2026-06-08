alter table public.profiles
  add column if not exists ai_brief_enabled boolean not null default false,
  add column if not exists ai_brief_model text not null default 'gpt-5-mini',
  add column if not exists ai_brief_tone text not null default 'calm';
