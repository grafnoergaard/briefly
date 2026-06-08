alter table public.profiles
  add column if not exists ai_custom_guidance text not null default '';
