# Briefly

Briefly is a digital everyday-life platform that gathers the most important things in one calm, intelligent briefing. Instead of another noisy dashboard, the product is built around a daily overview that turns calendars, tasks, shopping lists, meal plans, and family coordination into clarity, prioritization, and action.

## Stack

- Next.js 16 App Router
- TypeScript with `strict` mode
- Tailwind CSS v4
- `shadcn/ui` + Lucide Icons
- Supabase Auth + PostgreSQL + Row Level Security
- Vercel deployment target

## What ships in this MVP

- Google sign-in flow via Supabase Auth
- Mobile-first Home briefing mockup
- Top-level areas for Home, Calendar, Tasks, Meal Plan, Shopping, and Settings
- Supabase schema with extensible integration and AI tables
- RLS policies for personal and family-scoped data
- Vercel config and GitHub Actions CI

## Project structure

```text
src/
  app/
    auth/callback/      # Supabase OAuth callback
    calendar/           # Calendar view
    meal-plan/          # Weekly meal planning
    shopping/           # Shared shopping list
    settings/           # AI and future preference controls
    sign-in/            # Login screen
    tasks/              # Task prioritization view
  features/
    auth/
    home/
    navigation/
  lib/
    auth.ts
    supabase/
supabase/
  migrations/
.github/workflows/
```

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment file and fill in the values:

```bash
cp .env.example .env.local
```

3. Create a Supabase project and add these environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for future background sync jobs
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for provider token refresh during sync
- `OPENAI_API_KEY` to enable generated AI morning briefs
- `NEXT_PUBLIC_SITE_URL`, for example `http://localhost:3000`

4. Apply the database schema in Supabase SQL Editor or via the CLI:

```bash
supabase db push
```

5. Enable Google provider in Supabase Auth:

- Go to `Authentication -> Providers -> Google`
- Paste your Google OAuth Client ID and Client Secret
- Add `http://localhost:3000/auth/callback` as a redirect URL for local work
- Add your production callback URL too, for example `https://your-domain.vercel.app/auth/callback`
- Keep the same Google OAuth client credentials available to the app itself through `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, because Supabase does not refresh Google provider tokens for you

6. Configure Google Cloud Console:

- Enable Google OAuth consent screen
- Add scopes for profile/email plus future product scopes:
  - `.../auth/calendar.readonly`
  - `.../auth/tasks.readonly`
  - `.../auth/contacts.readonly`
  - `.../auth/gmail.readonly`
- Add the Supabase auth redirect URL supplied in the provider setup

7. Run the app:

```bash
npm run dev
```

8. Trigger the first calendar sync:

- Sign in with Google
- Open `/calendar`
- Click `Sync Google Calendar`
- The app will read from the Google primary calendar and cache the next 30 days into `calendar_events_cache`

9. Trigger the first tasks sync:

- Open `/tasks`
- Click `Sync Google Tasks`
- The app will read Google task lists and cache tasks into `tasks_cache`
- Reconnect Google once if you signed in before this change, because task write flow now requires the full `https://www.googleapis.com/auth/tasks` scope rather than the old read-only scope

## Deployment on Vercel

1. Import the repo into Vercel.
2. Add the same environment variables from `.env.local`.
3. Set `NEXT_PUBLIC_SITE_URL` to the exact production URL.
4. Re-add the production callback URL in Supabase Auth and Google Cloud Console.
5. Deploy.

## Database notes

The initial schema includes these core tables:

- `profiles`
- `family_groups`
- `family_group_members`
- `integration_accounts`
- `calendar_events_cache`
- `tasks_cache`
- `shopping_items`
- `meal_plans`
- `activity_feed`
- `ai_briefings`
- `integration_sync_jobs`

This lets us keep Google as source of truth while still caching data for briefings, family views, and future AI-generated summaries.

## Roadmap after MVP

- Real Google Calendar event sync and editing
- Google Tasks read/write
- Family shopping mutations
- Generated morning and evening briefings with OpenAI
- Background sync jobs and stale-cache handling
