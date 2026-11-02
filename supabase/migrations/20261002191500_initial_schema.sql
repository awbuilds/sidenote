-- Sidenote — initial backend schema.
--
-- Mirrors the local Dexie model (docs/plans/frontend-only-m1.md §4.2) using the
-- same domain vocabulary; snake_case columns are the wire format. Every table
-- is user-scoped and protected by RLS on `auth.uid()`.
--
-- The client generates ids with `crypto.randomUUID()` today, so every primary
-- key is a UUID and the first-run importer can push local rows unchanged.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user; display_name mirrors settings.profileName
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are self-readable" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "profiles are self-insertable" on public.profiles
  for insert to authenticated with check (id = auth.uid());

create policy "profiles are self-updatable" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Every new auth user gets a profile. Runs as the function owner so it can
-- write even though the signup request itself has no auth.uid() yet.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that already exist.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- notebooks — self-referencing tree, positions are sparse doubles
-- ---------------------------------------------------------------------------

create table public.notebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid references public.notebooks (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  position double precision not null default 0,
  -- Reserved for a future soft-delete; the app deletes notebooks outright.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notebooks_user_parent_position_idx
  on public.notebooks (user_id, parent_id, position);

alter table public.notebooks enable row level security;

create policy "notebooks are owner-scoped" on public.notebooks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger notebooks_set_updated_at
  before update on public.notebooks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tags — names are lowercased by the app; the dedup key is (user, lower(name))
-- ---------------------------------------------------------------------------

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (name = lower(name) and length(trim(name)) > 0),
  color text not null default 'slate',
  created_at timestamptz not null default now()
);

create unique index tags_user_lower_name_idx on public.tags (user_id, lower(name));

alter table public.tags enable row level security;

create policy "tags are owner-scoped" on public.tags
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notes — content_json is authoritative; markdown/text are derived
-- ---------------------------------------------------------------------------

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  notebook_id uuid references public.notebooks (id) on delete set null,
  title text not null default '',
  content_json jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  content_markdown text not null default '',
  content_text text not null default '',
  is_pinned boolean not null default false,
  is_trashed boolean not null default false,
  trashed_at timestamptz,
  version integer not null default 1,
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(content_text, '')), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_user_notebook_trashed_idx
  on public.notes (user_id, notebook_id, is_trashed);
create index notes_user_trashed_updated_idx
  on public.notes (user_id, is_trashed, updated_at desc);
create index notes_user_updated_idx
  on public.notes (user_id, updated_at desc);
create index notes_user_pinned_idx
  on public.notes (user_id) where is_pinned;
create index notes_search_idx on public.notes using gin (search_vector);

alter table public.notes enable row level security;

create policy "notes are owner-scoped" on public.notes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- note_tags — join table, composite key like the Dexie unique index
-- ---------------------------------------------------------------------------

create table public.note_tags (
  note_id uuid not null references public.notes (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, tag_id)
);

create index note_tags_user_idx on public.note_tags (user_id);
create index note_tags_tag_idx on public.note_tags (tag_id);

alter table public.note_tags enable row level security;

create policy "note_tags are owner-scoped" on public.note_tags
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- attachments — bytes live in the private `attachments` bucket; path is
-- `{user_id}/{attachment_id}/{file_name}`.
-- ---------------------------------------------------------------------------

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete cascade,
  path text not null,
  file_name text not null,
  mime text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  unique (user_id, path)
);

create index attachments_note_idx on public.attachments (note_id);

alter table public.attachments enable row level security;

create policy "attachments are owner-scoped" on public.attachments
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- versions — full snapshot per save, pruned on write
--
-- Caps are the plan's invariants (§4.3): last 30 per note, nothing older than
-- 90 days. Hardcoded here on purpose — a server-side ceiling that client
-- settings can only lower, never raise.
-- ---------------------------------------------------------------------------

create table public.versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete cascade,
  version integer not null,
  title text not null default '',
  content_json jsonb not null,
  content_markdown text not null default '',
  content_text text not null default '',
  created_at timestamptz not null default now(),
  unique (note_id, version)
);

create index versions_note_created_idx on public.versions (note_id, created_at desc);

alter table public.versions enable row level security;

create policy "versions are owner-scoped" on public.versions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.prune_note_versions()
returns trigger
language plpgsql
as $$
begin
  delete from public.versions v
  where v.note_id = new.note_id
    and (
      v.created_at < now() - interval '90 days'
      or v.id not in (
        select keep.id
        from public.versions keep
        where keep.note_id = new.note_id
        order by keep.version desc
        limit 30
      )
    );
  return null;
end;
$$;

create trigger versions_prune_after_insert
  after insert on public.versions
  for each row execute function public.prune_note_versions();

-- ---------------------------------------------------------------------------
-- shares — public read tokens for a note; password optional
-- ---------------------------------------------------------------------------

create table public.shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  password_hash text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index shares_note_idx on public.shares (note_id);

alter table public.shares enable row level security;

create policy "shares are owner-scoped" on public.shares
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The only anonymous read path. Security definer so it can look past RLS,
-- but it returns rows only for a live, unexpired, password-correct token.
create or replace function public.get_shared_note(
  p_token uuid,
  p_password text default null
)
returns table (
  id uuid,
  title text,
  content_json jsonb,
  content_markdown text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  s public.shares;
begin
  select *
    into s
    from public.shares
   where token = p_token
     and revoked_at is null
     and (expires_at is null or expires_at > now());

  if not found then
    return;
  end if;

  if s.password_hash is not null then
    if p_password is null
       or extensions.crypt(p_password, s.password_hash) <> s.password_hash then
      return;
    end if;
  end if;

  return query
    select n.id, n.title, n.content_json, n.content_markdown, n.updated_at
      from public.notes n
     where n.id = s.note_id;
end;
$$;

revoke all on function public.get_shared_note(uuid, text) from public;
grant execute on function public.get_shared_note(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- storage — private bucket, one folder per user
-- ---------------------------------------------------------------------------

-- RLS is already enabled on storage.objects by the Supabase image; only the
-- table owner may toggle it, so do not `alter table` here.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "attachments are owner-readable" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "attachments are owner-insertable" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "attachments are owner-updatable" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "attachments are owner-deletable" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
