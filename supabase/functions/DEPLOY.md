# Supabase Edge Functions Deploy Guide

This project has two deployable edge functions:

- `generate-initial-report`
- `generate-updated-report`

Both functions now import only from `supabase/functions/*` so Supabase CLI bundling is stable and self-contained.

## Required Secrets

Set these secrets before deploy:

```bash
supabase secrets set OPENROUTER_API_KEY=...
supabase secrets set SUPABASE_URL=...
supabase secrets set SUPABASE_ANON_KEY=...
```

Optional secrets:

```bash
supabase secrets set OPENROUTER_MODEL=openai/gpt-4o-mini
supabase secrets set OPENROUTER_APP_URL=https://your-app-url.example
supabase secrets set SUPABASE_PUBLISHABLE_KEYS='{"default":"..."}'
```

Notes:

- `SUPABASE_PUBLISHABLE_KEYS` is optional; if missing, functions use `SUPABASE_ANON_KEY`.
- `SUPABASE_URL` and either `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEYS.default` must be present.

## Deploy Commands

Link to the target project first (once per machine/session):

```bash
supabase link --project-ref <YOUR_PROJECT_REF>
```

Deploy both functions:

```bash
supabase functions deploy generate-initial-report
supabase functions deploy generate-updated-report
```

Deploy in one command:

```bash
supabase functions deploy generate-initial-report generate-updated-report
```

## Local Checks

Run from repository root:

```bash
npm run typecheck
deno check --config supabase/functions/deno.json supabase/functions/generate-initial-report/index.ts
deno check --config supabase/functions/deno.json supabase/functions/generate-updated-report/index.ts
```
