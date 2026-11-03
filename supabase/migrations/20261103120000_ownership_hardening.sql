-- Ownership hardening for shares and attachment quota.
--
-- Two gaps closed here:
--
-- 1. A share row never proved that its note belonged to the same user. RLS on
--    `shares` checks only `user_id`, and the `note_id` foreign key is enforced
--    by the table owner, so any authenticated user who learned a note UUID
--    could mint a share for it. `get_shared_note` is SECURITY DEFINER and read
--    any note by id, so that share then disclosed the other user's content —
--    revocation and passwords notwithstanding.
--
-- 2. The attachment quota trigger only ran on INSERT. An owner could insert a
--    row at size 0 and update `size_bytes` afterwards, which is the whole
--    budget. It also counted the row being updated twice.
--
-- Also: share password hashes no longer need to reach the browser. A generated
-- `has_password` column is what the app actually reads.

-- ---------------------------------------------------------------------------
-- Shares: the note must belong to the share owner
-- ---------------------------------------------------------------------------

create or replace function public.verify_share_note_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- RLS on `notes` applies to this query, so an authenticated caller can only
  -- see their own rows. The explicit user_id predicate also covers the service
  -- role, which bypasses RLS.
  if not exists (
    select 1
    from public.notes n
    where n.id = new.note_id
      and n.user_id = new.user_id
  ) then
    raise exception 'the note does not belong to the share owner'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Clean up rows created through the old path before the trigger exists.
delete from public.shares s
where not exists (
  select 1
  from public.notes n
  where n.id = s.note_id
    and n.user_id = s.user_id
);

drop trigger if exists shares_verify_note_owner on public.shares;

create trigger shares_verify_note_owner
  before insert or update of note_id, user_id on public.shares
  for each row execute function public.verify_share_note_owner();

-- The app only needs a boolean, not the bcrypt hash.
alter table public.shares
  add column if not exists has_password boolean
  generated always as (password_hash is not null) stored;

-- ---------------------------------------------------------------------------
-- create_share: ownership check + a minimum password length
-- ---------------------------------------------------------------------------

create or replace function public.create_share(
  p_note_id uuid,
  p_password text default null,
  p_expires_at timestamptz default null
)
returns table (id uuid, token uuid, has_password boolean, expires_at timestamptz)
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_share public.shares;
  v_password text := nullif(btrim(coalesce(p_password, '')), '');
begin
  if auth.uid() is null then
    raise exception 'sign in to create share links' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.notes n
    where n.id = p_note_id and n.user_id = auth.uid()
  ) then
    -- Deliberately indistinguishable from a missing note: do not confirm the
    -- existence of another user's id.
    raise exception 'note not found' using errcode = '42501';
  end if;

  if v_password is not null and length(v_password) < 8 then
    raise exception 'share passwords must be at least 8 characters'
      using errcode = '22023';
  end if;

  insert into public.shares as s (user_id, note_id, password_hash, expires_at)
  values (
    auth.uid(),
    p_note_id,
    case
      when v_password is null then null
      else extensions.crypt(v_password, extensions.gen_salt('bf'))
    end,
    -- `now()` is transaction-stable, so this can never exceed the row's own
    -- created_at + 30 days and satisfies `shares_expiry_bounded`.
    least(
      coalesce(p_expires_at, now() + interval '30 days'),
      now() + interval '30 days'
    )
  )
  returning s.* into v_share;

  return query
    select v_share.id, v_share.token, v_share.password_hash is not null, v_share.expires_at;
end;
$$;

revoke all on function public.create_share(uuid, text, timestamptz) from public;
grant execute on function public.create_share(uuid, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- get_shared_note: never return a note the share's owner does not own
-- ---------------------------------------------------------------------------

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
     and expires_at is not null
     and expires_at > now();

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
     where n.id = s.note_id
       -- Defence in depth: even a share row that slipped past the trigger
       -- cannot disclose a note owned by someone else.
       and n.user_id = s.user_id
       and n.is_trashed = false;
end;
$$;

revoke all on function public.get_shared_note(uuid, text) from public;
grant execute on function public.get_shared_note(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Attachment quota: updates count too, and do not double-count the row
-- ---------------------------------------------------------------------------

create or replace function public.enforce_attachment_quota()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  cap bigint := 50 * 1024 * 1024;
  used bigint;
begin
  -- Nothing quota-relevant changed.
  if tg_op = 'UPDATE'
     and new.size_bytes = old.size_bytes
     and new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;

  if new.deleted_at is not null then
    return new;
  end if;

  select coalesce(sum(size_bytes), 0) into used
  from public.attachments
  where user_id = new.user_id
    and deleted_at is null
    and (tg_op = 'INSERT' or id <> new.id);

  if used + new.size_bytes > cap then
    raise exception using
      errcode = 'check_violation',
      message = format(
        'Attachment quota exceeded: %s MB of %s MB used. Delete some images, or keep this one on this device only.',
        round(used / 1048576.0, 1),
        cap / 1048576
      ),
      hint = 'Free accounts include 50 MB of synced attachments.';
  end if;

  return new;
end;
$$;

drop trigger if exists attachments_enforce_quota on public.attachments;

create trigger attachments_enforce_quota
  before insert or update of size_bytes, deleted_at on public.attachments
  for each row execute function public.enforce_attachment_quota();
