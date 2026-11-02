-- Attachment sync: soft deletes for cross-device propagation + a free-tier
-- storage budget.

alter table public.attachments
  add column if not exists deleted_at timestamptz;

create index if not exists attachments_user_created_idx
  on public.attachments (user_id, created_at);

-- Free accounts get 50 MB of synced attachment bytes. Images are compressed
-- client-side before upload (src/lib/image/compress.ts), so this is a ceiling,
-- not a target. Keep in step with FREE_ATTACHMENT_BYTES in the app.
create or replace function public.enforce_attachment_quota()
returns trigger
language plpgsql
as $$
declare
  cap bigint := 50 * 1024 * 1024;
  used bigint;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  select coalesce(sum(size_bytes), 0) into used
  from public.attachments
  where user_id = new.user_id
    and deleted_at is null;

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

create trigger attachments_enforce_quota
  before insert on public.attachments
  for each row execute function public.enforce_attachment_quota();

update storage.buckets
set file_size_limit = 5242880
where id = 'attachments';
