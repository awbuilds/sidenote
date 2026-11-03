-- Ownership and quota regressions for the self-hosted backend.
--
-- Run with `supabase test db` against a local stack (see CONTRIBUTING.md).
-- These are the checks that would have caught the share-link IDOR: a share row
-- never proved that its note belonged to the same user, and the security-definer
-- reader then returned any note by id.

begin;

create extension if not exists pgtap;

select plan(6);

-- Two users, and a note owned by the first.
insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'attacker@example.test');

insert into public.notes (id, user_id, title, content_json)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'Owner note',
  '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb
);

-- ---------------------------------------------------------------------------
-- As the attacker: cannot mint a share for the owner's note
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select * from public.create_share('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null) $$,
  '42501',
  'note not found',
  'a user cannot create a share for a note they do not own'
);

select throws_ok(
  $$ insert into public.shares (user_id, note_id)
     values ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  '42501',
  'the note does not belong to the share owner',
  'the trigger blocks a direct insert that points at another user''s note'
);

reset role;

-- ---------------------------------------------------------------------------
-- Defence in depth: a forged row still cannot disclose the note
--
-- The trigger makes this row impossible through the API; disable it for the
-- setup so the reader's own ownership predicate is what is under test.
-- ---------------------------------------------------------------------------

alter table public.shares disable trigger shares_verify_note_owner;

insert into public.shares (id, user_id, note_id, token, expires_at)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  now() + interval '1 day'
);

alter table public.shares enable trigger shares_verify_note_owner;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select count(*)::int from public.get_shared_note('cccccccc-cccc-4ccc-8ccc-cccccccccccc', null)),
  0,
  'get_shared_note refuses a share whose note belongs to someone else'
);

reset role;

-- ---------------------------------------------------------------------------
-- As the owner: a legitimate share works, but a short password is rejected
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select * from public.create_share('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'short', null) $$,
  '22023',
  'share passwords must be at least 8 characters',
  'a share password has a minimum length'
);

select is(
  (select has_password from public.create_share(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'longenough', null
  )),
  true,
  'the owner can create a password-protected share'
);

-- ---------------------------------------------------------------------------
-- Quota: an UPDATE cannot raise size_bytes past the cap
-- ---------------------------------------------------------------------------

insert into public.attachments (id, user_id, note_id, path, file_name, mime, size_bytes)
values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111/dddd/file.png',
  'file.png',
  'image/png',
  0
);

select throws_ok(
  $$ update public.attachments
        set size_bytes = 60 * 1024 * 1024
      where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' $$,
  '23514',
  null,
  'raising an attachment past the 50 MB budget is rejected on UPDATE'
);

select * from finish();

rollback;
