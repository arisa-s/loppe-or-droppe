-- Initial persistence schema for the Expo MVP.
-- ObjectReport remains the source of truth; selected fields are duplicated for indexing.

create extension if not exists pgcrypto;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  report_id text not null,
  object_report jsonb not null,
  status text not null check (status in ('initial', 'updated')),
  mode text not null check (mode in ('basic', 'seller')),
  recommendation text not null check (
    recommendation in ('buy', 'negotiate', 'pass', 'research_more')
  ),
  score integer not null check (score between 0 and 100),
  version integer not null check (version >= 1),
  user_decision text check (user_decision in ('buy', 'pass')),
  seller_price numeric,
  seller_currency text,
  buying_country text,
  home_country text,
  object_name text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  inserted_at timestamptz not null default now(),
  unique (owner_id, report_id),
  unique (owner_id, id),
  constraint reports_object_report_is_object check (jsonb_typeof(object_report) = 'object'),
  constraint reports_report_id_matches_json check (object_report ->> 'id' = report_id),
  constraint reports_status_matches_json check (object_report ->> 'status' = status),
  constraint reports_mode_matches_json check (object_report ->> 'mode' = mode),
  constraint reports_version_matches_json check (
    nullif(object_report ->> 'version', '')::integer = version
  ),
  constraint reports_recommendation_matches_json check (
    object_report #>> '{decision,recommendation}' = recommendation
  ),
  constraint reports_score_matches_json check (
    nullif(object_report #>> '{decision,worthBringingHomeScore}', '')::integer = score
  )
);

create index reports_owner_updated_at_idx
  on public.reports (owner_id, updated_at desc);

create index reports_owner_report_id_idx
  on public.reports (owner_id, report_id);

create index reports_owner_status_idx
  on public.reports (owner_id, status);

create index reports_owner_mode_idx
  on public.reports (owner_id, mode);

create index reports_owner_recommendation_idx
  on public.reports (owner_id, recommendation);

create index reports_owner_score_idx
  on public.reports (owner_id, score desc);

create index reports_object_report_gin_idx
  on public.reports using gin (object_report jsonb_path_ops);

alter table public.reports enable row level security;

create policy "Users can select their reports"
  on public.reports
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy "Users can insert their reports"
  on public.reports
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "Users can update their reports"
  on public.reports
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Users can delete their reports"
  on public.reports
  for delete
  to authenticated
  using (owner_id = auth.uid());

create table public.report_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  report_id uuid not null,
  report_public_id text not null,
  storage_bucket text not null default 'report-photos',
  storage_path text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  content_type text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (owner_id, storage_bucket, storage_path),
  foreign key (owner_id, report_id) references public.reports (owner_id, id) on delete cascade,
  constraint report_photos_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create index report_photos_owner_created_at_idx
  on public.report_photos (owner_id, created_at desc);

create index report_photos_report_sort_idx
  on public.report_photos (report_id, sort_order, created_at);

create index report_photos_owner_report_public_id_idx
  on public.report_photos (owner_id, report_public_id);

alter table public.report_photos enable row level security;

create policy "Users can select their report photos"
  on public.report_photos
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy "Users can insert their report photos"
  on public.report_photos
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.reports
      where reports.id = report_photos.report_id
        and reports.owner_id = auth.uid()
        and reports.report_id = report_photos.report_public_id
    )
  );

create policy "Users can update their report photos"
  on public.report_photos
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.reports
      where reports.id = report_photos.report_id
        and reports.owner_id = auth.uid()
        and reports.report_id = report_photos.report_public_id
    )
  );

create policy "Users can delete their report photos"
  on public.report_photos
  for delete
  to authenticated
  using (owner_id = auth.uid());

create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  latest_report_id uuid references public.reports (id) on delete set null,
  latest_report_public_id text,
  title text,
  locale text,
  pending_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id),
  constraint chat_sessions_pending_context_is_object
    check (jsonb_typeof(pending_context) = 'object')
);

create index chat_sessions_owner_updated_at_idx
  on public.chat_sessions (owner_id, updated_at desc);

create index chat_sessions_owner_latest_report_idx
  on public.chat_sessions (owner_id, latest_report_id);

alter table public.chat_sessions enable row level security;

create policy "Users can select their chat sessions"
  on public.chat_sessions
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy "Users can insert their chat sessions"
  on public.chat_sessions
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and (
      latest_report_id is null
      or exists (
        select 1
        from public.reports
        where reports.id = chat_sessions.latest_report_id
          and reports.owner_id = auth.uid()
          and (
            chat_sessions.latest_report_public_id is null
            or reports.report_id = chat_sessions.latest_report_public_id
          )
      )
    )
  );

create policy "Users can update their chat sessions"
  on public.chat_sessions
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      latest_report_id is null
      or exists (
        select 1
        from public.reports
        where reports.id = chat_sessions.latest_report_id
          and reports.owner_id = auth.uid()
          and (
            chat_sessions.latest_report_public_id is null
            or reports.report_id = chat_sessions.latest_report_public_id
          )
      )
    )
  );

create policy "Users can delete their chat sessions"
  on public.chat_sessions
  for delete
  to authenticated
  using (owner_id = auth.uid());

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  chat_session_id uuid not null,
  message_id text not null,
  role text not null check (role in ('user', 'assistant')),
  kind text not null check (kind in ('text', 'photo_upload', 'question')),
  report_id uuid references public.reports (id) on delete set null,
  report_public_id text,
  message jsonb not null,
  created_at timestamptz not null,
  inserted_at timestamptz not null default now(),
  unique (chat_session_id, message_id),
  foreign key (owner_id, chat_session_id) references public.chat_sessions (owner_id, id) on delete cascade,
  constraint chat_messages_message_is_object check (jsonb_typeof(message) = 'object'),
  constraint chat_messages_message_id_matches_json check (message ->> 'id' = message_id),
  constraint chat_messages_role_matches_json check (message ->> 'role' = role),
  constraint chat_messages_kind_matches_json check (message ->> 'kind' = kind)
);

create index chat_messages_session_created_at_idx
  on public.chat_messages (chat_session_id, created_at);

create index chat_messages_owner_created_at_idx
  on public.chat_messages (owner_id, created_at desc);

create index chat_messages_owner_kind_idx
  on public.chat_messages (owner_id, kind);

alter table public.chat_messages enable row level security;

create policy "Users can select their chat messages"
  on public.chat_messages
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy "Users can insert their chat messages"
  on public.chat_messages
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.chat_sessions
      where chat_sessions.id = chat_messages.chat_session_id
        and chat_sessions.owner_id = auth.uid()
    )
    and (
      report_id is null
      or exists (
        select 1
        from public.reports
        where reports.id = chat_messages.report_id
          and reports.owner_id = auth.uid()
          and (
            chat_messages.report_public_id is null
            or reports.report_id = chat_messages.report_public_id
          )
      )
    )
  );

create policy "Users can update their chat messages"
  on public.chat_messages
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.chat_sessions
      where chat_sessions.id = chat_messages.chat_session_id
        and chat_sessions.owner_id = auth.uid()
    )
    and (
      report_id is null
      or exists (
        select 1
        from public.reports
        where reports.id = chat_messages.report_id
          and reports.owner_id = auth.uid()
          and (
            chat_messages.report_public_id is null
            or reports.report_id = chat_messages.report_public_id
          )
      )
    )
  );

create policy "Users can delete their chat messages"
  on public.chat_messages
  for delete
  to authenticated
  using (owner_id = auth.uid());

-- Note: tables intentionally not included in this initial schema:
--   * saved_reports (no save UI yet -- placeholder screen only)
--   * report_improvement_submissions (submissions are materialized as a new
--     reports version + chat_messages summary; no audit consumer yet)
--   * ai_runs (Edge Functions only hold the caller JWT today, so any insert
--     would be subject to user RLS -- not tamper-proof telemetry; see
--     docs/backend-setup.md for the recommended server-side path)
-- Each will land in a focused migration alongside the code that reads/writes it.

-- Private Storage bucket and RLS policies for report photos.
-- Path convention: <auth.uid()>/<report_id>/<photo_name>
-- storage.foldername() returns folder segments excluding the filename, so a
-- 3-segment path yields a 2-element array: [auth.uid(), report_id].
insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', false)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Users can select their report photo objects" on storage.objects;
create policy "Users can select their report photo objects"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 2
    and nullif((storage.foldername(name))[2], '') is not null
  );

drop policy if exists "Users can insert their report photo objects" on storage.objects;
create policy "Users can insert their report photo objects"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 2
    and nullif((storage.foldername(name))[2], '') is not null
  );

drop policy if exists "Users can update their report photo objects" on storage.objects;
create policy "Users can update their report photo objects"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 2
    and nullif((storage.foldername(name))[2], '') is not null
  )
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 2
    and nullif((storage.foldername(name))[2], '') is not null
  );

drop policy if exists "Users can delete their report photo objects" on storage.objects;
create policy "Users can delete their report photo objects"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 2
    and nullif((storage.foldername(name))[2], '') is not null
  );

-- Verification notes:
-- 1) Bucket is private:
--    select id, name, public from storage.buckets where id = 'report-photos';
-- 2) Policies are present for select/insert/update/delete:
--    select policyname, cmd
--    from pg_policies
--    where schemaname = 'storage'
--      and tablename = 'objects'
--      and policyname like 'Users can % their report photo objects'
--    order by cmd;
