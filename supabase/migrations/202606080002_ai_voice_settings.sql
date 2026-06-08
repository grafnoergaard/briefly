alter table public.profiles
  add column if not exists ai_voice_name text not null default 'coral',
  add column if not exists ai_voice_speed double precision not null default 1.16,
  add column if not exists ai_voice_style text not null default 'Varm, rolig, moderne og tydelig dansk stemme med naturlige pauser.';
