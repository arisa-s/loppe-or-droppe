# Backend setup

This guide covers configuring Supabase (Postgres migrations, Storage, Edge Functions), OpenRouter secrets, and the Expo client so report generation works end-to-end.

For how these pieces fit together in the app (persistence bridge, photo refs, mock fallback), see [architecture.md](architecture.md#backend-supabase-openrouter-and-mock-fallback).

## Prerequisites

- A [Supabase](https://supabase.com/dashboard) project
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed and logged in (`supabase login`)
- This repo linked to the project (`supabase link --project-ref <ref>`), or pass `--project-ref` on CLI commands

---

## 1. Expo / client environment variables

The app reads Supabase URL and anon (publishable) key via Expo public env vars. [`tryReadSupabaseEnv`](../src/lib/supabase/env.ts) is used at runtime: if either value is missing or empty, [`getSupabaseClient()`](../src/lib/supabase/client.ts) returns `null` and the app runs in **offline-style mode** (no DB/Storage sync, no Edge Function calls; report generation falls back to the deterministic mock when the backend is considered unavailable—see [architecture.md](architecture.md#backend-supabase-openrouter-and-mock-fallback)). `readSupabaseEnv()` exists for strict checks but is not required for a normal boot.

| Variable | When required | Purpose |
|----------|---------------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Full backend | HTTPS project URL (`https://<project-ref>.supabase.co`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Full backend | Publishable/anonymous client key used by `supabase-js` in the app |

Set both in `.env` (or your hosting provider’s env UI) per Expo’s conventions whenever you want persistence, Storage uploads, and Edge Function–backed reports.

### Client session

[`ensureSupabaseSession`](../src/lib/supabase/auth.ts) runs before persistence and before invoking report Edge Functions. If there is no session, it calls **`signInAnonymously()`**. That requires **anonymous sign-ins enabled** in the Supabase project (Auth → Providers). If anonymous auth is disabled, persistence and backend report calls return `auth_required` (shown as a persistence warning or thrown `ReportBackendError`); mocks are **not** used as a silent fallback when the backend is configured but auth fails.

When `getSupabaseClient()` is `null`, session helpers short-circuit with `disabled`; no anonymous user is created.

---

## 2. Edge Functions: Supabase-injected vs custom secrets

Deployed Edge Functions rely on **`Deno.env`** variables.

### Auto-provided on Supabase-hosted Edge Functions

When you deploy to Supabase, the platform supplies (names may evolve; check the [dashboard Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)):

| Variable | Used by this repo |
|----------|-------------------|
| `SUPABASE_URL` | **Yes** — must be set so functions can construct the Supabase client ([`generate-initial-report`](../supabase/functions/generate-initial-report/index.ts), [`generate-updated-report`](../supabase/functions/generate-updated-report/index.ts)) |

Typically `SUPABASE_URL` is injected automatically when secrets are synced with the CLI; verify it appears in Project Settings → Edge Functions → Secrets if anything fails with “Supabase URL is not configured.”

### Publishable key handling (`SUPABASE_ANON_KEY` vs `SUPABASE_PUBLISHABLE_KEYS`)

Both report functions resolve the JS client API key like this:

1. If **`SUPABASE_PUBLISHABLE_KEYS`** is set and non-empty, it is parsed as JSON. The code expects a **`default`** string key:

   ```json
   {"default":"<your-publishable-or-legacy-anon-key>"}
   ```

2. Otherwise **`SUPABASE_ANON_KEY`** must be non-empty (legacy anon key compatibility).

Locally you can mirror dashboard behavior; on hosted projects Supabase commonly sets whichever key model your project uses. If publishable keys are enabled on your project, prefer setting `SUPABASE_PUBLISHABLE_KEYS` with the documented JSON shape; otherwise **`SUPABASE_ANON_KEY`** is sufficient.

Never use the **`service_role`** key for these reads; the Edge Function impersonates the caller via `Authorization` and only needs the same class of key the client uses for the API.

---

## 3. OpenRouter (Edge Function secrets)

Configured in [`supabase/functions/_shared/openrouter.ts`](../supabase/functions/_shared/openrouter.ts):

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENROUTER_API_KEY` | **Yes** | Bearer token for `https://openrouter.ai/api/v1/chat/completions`. Missing or empty ⇒ `backend_not_configured` responses. |
| `OPENROUTER_MODEL` | No | Model id; defaults to `openai/gpt-4o-mini` |
| `OPENROUTER_APP_URL` | No | If set, sent as `HTTP-Referer` (OpenRouter / provider attribution) |

Set secrets for the linked project:

```bash
supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
# optional:
supabase secrets set OPENROUTER_MODEL=openai/gpt-4o-mini
supabase secrets set OPENROUTER_APP_URL=https://your-app-or-site.example
```

Redeploy functions after changing secrets if your workflow requires it.

---

## 4. Deploy database migrations

Migrations live under `supabase/migrations/`. The initial schema defines app tables, RLS, Storage bucket `report-photos`, and `storage.objects` policies.

### Remote project

From the repo root:

```bash
supabase db push
```

Or apply via the Supabase dashboard SQL runner if your team does not use the CLI for production (not recommended unless you mirror the migration files exactly).

### Local development

Use `supabase start` and migrations apply when the stack initializes, or push to the local DB with the same CLI flow your team uses (`supabase migration up`, etc.—see `supabase db --help`).

---

## 5. Storage: bucket and policies verification

Migration [`20260505165000_initial_app_schema.sql`](../supabase/migrations/20260505165000_initial_app_schema.sql):

- Ensures bucket **`report-photos`** exists with **`public = false`** (private bucket).
- Path convention enforced by Storage RLS:

  **`{auth.uid()}/{report_id}/{photo_name}`** — exactly three folder segments (`array_length(storage.foldername(name), 1) = 3`).

Edge helpers in [`supabase/functions/_shared/storage.ts`](../supabase/functions/_shared/storage.ts):

- Allowed bucket constant: **`report-photos`**.
- Object path prefix must equal the authenticated **`user.id`** (`ref.path.startsWith(\`${userId}/\`)`).

### Verification SQL (matches comments in migration)

Run in SQL Editor:

```sql
-- Bucket must exist and stay private
select id, name, public
from storage.buckets
where id = 'report-photos';

-- Four policies on storage.objects for report uploads
select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'Users can % their report photo objects'
order by cmd;
```

Also confirm uploads from the app use paths under `report-photos/${userId}/...` so signed URL creation in Edge Functions succeeds.

---

## 6. Deploy Edge Functions

Function entrypoints:

| Slug | Source |
|------|--------|
| `generate-initial-report` | `supabase/functions/generate-initial-report/index.ts` |
| `generate-updated-report` | `supabase/functions/generate-updated-report/index.ts` |

The Expo client invokes them via `client.functions.invoke("generate-initial-report"` / `"generate-updated-report")` ([`reportApiClient.ts`](../src/features/report/ai/reportApiClient.ts)).

Deploy both (JWT verification stays **enabled** — functions require a valid **`Authorization`** session header):

```bash
supabase functions deploy generate-initial-report
supabase functions deploy generate-updated-report
```

Or deploy every function:

```bash
supabase functions deploy
```

Unless you intentionally disable auth at the gateway, **do not** pass `--no-verify-jwt`; the handlers return `401 auth_required` when `Authorization` is missing.

Shared code lives under `supabase/functions/_shared/` (`http.ts`, `openrouter.ts`, `storage.ts`, `report/`). No extra deploy flags are needed beyond the CLI defaults for import maps (`deno.json` is present).

---

## 7. Smoke-test checklist

Use this order after migrations, secrets, and function deploy.

1. **Client env**: With both `EXPO_PUBLIC_*` vars set, `getSupabaseClient()` is non-null. Without them, the app still starts; only Supabase-backed features are disabled.
2. **Auth**: User can sign in; `ensureSupabaseSession` path succeeds before report calls (`auth_required` should not appear for signed-in flows).
3. **Storage**: Upload at least one image to **`report-photos`** under **`{your-uid}/{reportId}/{filename}`**; listing/download rules match RLS (no cross-user access).
4. **CORS preflight**: `OPTIONS` request to either function URL returns success with `Access-Control-Allow-Origin: *` and allows `authorization, x-client-info, apikey, content-type` ([`http.ts`](../supabase/functions/_shared/http.ts)).
5. **`generate-initial-report`**: From the app, create a report with ≥1 photo; expect `200` and JSON `{ ok: true, report: { ... } }`. If OpenRouter misconfigured, expect `backend_not_configured` or `503` from the function.
6. **`generate-updated-report`**: From the app, run an improvement or follow-up flow that hits the updater; expect `ok: true` and incremented `report.version`.
7. **Failures worth spot-checking**
   - No `OPENROUTER_API_KEY`: backend returns provider-side “not configured” style errors.
   - Wrong storage path bucket or missing user prefix: `insufficient_photos` or signed-URL failures.
   - Unauthenticated invoke: `401` with `auth_required`.

Optional: Invoke functions with `curl` using a logged-in user’s access token (`Authorization: Bearer <access_token>`) and a minimal JSON body that matches validators in `_shared/report/validation.ts` for faster iteration than full UI flows.

---

## Deferred persistence (intentionally out of the initial schema)

The initial migration only includes tables that current backend code actually reads or writes:

- `reports`, `report_photos`
- `chat_sessions`, `chat_messages`
- Storage bucket `report-photos`

The following tables are deliberately **not** part of the initial schema. Each should land in a focused migration alongside the code that reads/writes it.

### `saved_reports` (deferred — feature not implemented)

`src/app/saved.tsx` is a phase-1 placeholder. There is no Save action, no list view, and no client code that touches a saved-reports table. Add the table with the first PR that introduces a real save flow (write path + list query + RLS), so the schema and the feature ship together.

### `report_improvement_submissions` (deferred — no audit consumer)

When a user submits the improvement form, [`generate-updated-report`](../supabase/functions/generate-updated-report/index.ts) turns the submission into a new `reports` row (incremented `version`, `status = "updated"`) and the client posts an assistant summary into `chat_messages`. No code reads or writes a separate submission audit row, so the table would be write-only with no consumer. Add it when an audit/history surface is built (e.g., admin replay tooling, analytics, or per-report submission timeline UI).

### `ai_runs` (deferred — needs server-side telemetry, not user RLS)

The current Edge Functions create their Supabase client with the **caller's** JWT (publishable/anon key plus the inbound `Authorization` header). That client cannot be used safely for telemetry:

- Any `INSERT` into `ai_runs` would run under user RLS, so users could `SELECT`, `UPDATE`, or `DELETE` their own telemetry rows. That is not a useful observability surface.
- Per-call latency would also worsen, because logging "started" then patching to "succeeded"/"failed" requires two round-trips on the user-context client.

The recommended server-side approach when `ai_runs` actually lands:

1. Read `SUPABASE_SERVICE_ROLE_KEY` (treat it as a secret with the same care as `OPENROUTER_API_KEY`) and create a **second** Supabase client inside each Edge Function:
   ```ts
   const adminClient = createClient(
     Deno.env.get("SUPABASE_URL")!,
     Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
     { auth: { persistSession: false, autoRefreshToken: false } },
   );
   ```
   Keep the existing user-JWT client for everything that should be RLS-checked (`auth.getUser`, signed URLs). Only the admin client writes to `ai_runs`.
2. Write RLS so users have **no** access to `ai_runs` (`select`/`insert`/`update`/`delete` denied for `authenticated`). Service role bypasses RLS, so writes still work; analytics dashboards consume the data via service-role tooling or a read-only view exposed to a separate role.
3. Capture `started_at` before the OpenRouter call, then a single follow-up update with `finished_at`, `status`, `latency_ms`, `token_input`, `token_output`, `error_message`, and any `output_summary` you want to retain. Avoid storing full prompts/outputs by default; redact or summarize on the function side.
4. Make the writes **non-blocking** for the user-facing response: fire the insert/update with `void`/no `await` after the response is built, or wrap in a `try/catch` so a logging failure never breaks report generation.

Until those pieces are in place, log to the Edge Function runtime (`console.log`/`console.error`, viewable in the Supabase dashboard) which is sufficient for debugging the MVP without introducing a service-role secret.

---

## Summary table

| Layer | Variables / artifacts |
|------|-------------------------|
| Expo | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (optional vars ⇒ mock/offline-capable client) |
| Supabase Auth | **Anonymous sign-in enabled** whenever using persistence + Edge invokes |
| Edge (Supabase) | `SUPABASE_URL`; `SUPABASE_PUBLISHABLE_KEYS` **or** `SUPABASE_ANON_KEY` |
| Edge (OpenRouter) | `OPENROUTER_API_KEY`; optional `OPENROUTER_MODEL`, `OPENROUTER_APP_URL` |
| Database | Run migrations (`supabase db push`) |
| Storage | Private bucket `report-photos`, paths `{uid}/{reportId}/{photo}` |
| Deploy | `supabase functions deploy generate-initial-report` and `generate-updated-report` |
