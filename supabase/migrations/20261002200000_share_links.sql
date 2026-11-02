-- Share links: creation + password semantics.
--
-- Reading a share publicly is still `get_shared_note` (security definer; it
-- returns rows only for a live token and a matching password). These additions
-- let an authenticated owner create a share without shipping bcrypt to the
-- browser, and let the viewer tell "needs a password" apart from "not found".

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
    p_expires_at
  )
  returning s.* into v_share;

  return query
    select v_share.id, v_share.token, v_share.password_hash is not null, v_share.expires_at;
end;
$$;

revoke all on function public.create_share(uuid, text, timestamptz) from public;
grant execute on function public.create_share(uuid, text, timestamptz) to authenticated;

-- Existence and password requirement without content.
create or replace function public.share_info(p_token uuid)
returns table (found boolean, requires_password boolean)
language sql
security definer
set search_path = public, pg_temp
as $$
  select true, (s.password_hash is not null)
  from public.shares s
  where s.token = p_token
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now());
$$;

revoke all on function public.share_info(uuid) from public;
grant execute on function public.share_info(uuid) to anon, authenticated;
