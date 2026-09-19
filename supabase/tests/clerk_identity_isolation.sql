-- Two-user isolation check for requesting_user_id() after
-- 20260919120000_clerk_identity.sql. Run on a test project (SQL editor or
-- psql) with the Clerk Third-Party Auth integration already activated.
--
-- This is not wired into `pnpm validate`: CineTrack has no pgTAP runner.
-- It is the security coverage the Clerk cutover added, because no existing
-- CineTrack test exercised RLS isolation.
--
-- Expected: each block's SELECT returns only the row owned by that `sub`.

create temporary table if not exists isolation_probe (
  user_id text primary key,
  note text not null
);

truncate isolation_probe;

-- Simulate JWT claims the way PostgREST does for a Third-Party Auth token.
-- Replace the two `sub` values with real Clerk user ids when running
-- against live tokens instead of set_config.

begin;
  select set_config('request.jwt.claims', '{"sub":"user_alice","role":"authenticated"}', true);
  insert into isolation_probe(user_id, note)
  values (requesting_user_id(), 'alice');
commit;

begin;
  select set_config('request.jwt.claims', '{"sub":"user_bob","role":"authenticated"}', true);
  insert into isolation_probe(user_id, note)
  values (requesting_user_id(), 'bob');
commit;

begin;
  select set_config('request.jwt.claims', '{"sub":"user_alice","role":"authenticated"}', true);
  -- Must be user_alice only. If this returns bob's row, requesting_user_id()
  -- is not isolating.
  select user_id, note from isolation_probe where user_id = requesting_user_id();
commit;

begin;
  select set_config('request.jwt.claims', '{"sub":"user_bob","role":"authenticated"}', true);
  select user_id, note from isolation_probe where user_id = requesting_user_id();
commit;
