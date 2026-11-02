-- Share links always expire, and never more than 30 days after creation.
--
-- The app no longer offers "never", but the database enforces the rule for
-- every write path: the RPC clamps a null or open-ended expiry, existing
-- permanent links are given the maximum from their creation date, and a check
-- constraint keeps both halves of the invariant true from here on.

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
begin
  if auth.uid() is null then
    raise exception 'sign in to create share links' using errcode = '42501';
  end if;

  insert into public.shares as s (user_id, note_id, password_hash, expires_at)
  values (
    auth.uid(),
    p_note_id,
    case
      when p_password is null or length(btrim(p_password)) = 0 then null
      else extensions.crypt(btrim(p_password), extensions.gen_salt('bf'))
    end,
    -- `now()` is transaction-stable, so this can never exceed the row's own
    -- created_at + 30 days and satisfies the constraint below.
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

-- Grandfather existing permanent links with the maximum from their creation
-- date. A link older than 30 days expires now, which is the policy.
update public.shares
set expires_at = created_at + interval '30 days'
where expires_at is null;

-- A client-supplied expiry can sit a little past created_at + 30 days when the
-- client clock runs ahead of the server. Fold those into the cap before the
-- constraint is validated.
update public.shares
set expires_at = created_at + interval '30 days'
where expires_at > created_at + interval '30 days';

alter table public.shares
  add constraint shares_expiry_bounded
  check (
    expires_at is not null
    and expires_at <= created_at + interval '30 days'
  );
