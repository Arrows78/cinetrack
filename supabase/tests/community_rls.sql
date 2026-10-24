-- Real RLS coverage for the community tables, run with `supabase test db`
-- (pgTAP ships with the local Supabase stack). It exercises the policies as
-- the `authenticated` and `anon` roles with PostgREST-style JWT claims, and
-- would fail with the policies of 20260919120000 alone.
--
-- Not wired into `pnpm validate`: it needs the Docker-based local stack.

begin;
select plan(7);

-- Fixtures, written as the table owner (RLS does not apply to it).
insert into public.community_profiles (user_id, handle, display_name, is_private)
values ('user_owner', 'owner', 'Owner', false), ('user_blocked', 'blocked', 'Blocked', false), ('user_other', 'other', 'Other', false);

insert into public.community_reviews (id, user_id, media_id, media_type, body, visibility)
values ('11111111-1111-1111-1111-111111111111', 'user_owner', 1, 'movie', 'review', 'followers');

insert into public.community_blocks (blocker_id, blocked_id) values ('user_owner', 'user_blocked');

-- A stranger cannot comment on a followers-only review.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_other","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.community_comments (review_id, user_id, body)
    values ('11111111-1111-1111-1111-111111111111', 'user_other', 'hi')$$,
  '42501', null, 'a non-follower cannot comment on a followers-only review');
select throws_ok(
  $$insert into public.community_review_likes (review_id, user_id)
    values ('11111111-1111-1111-1111-111111111111', 'user_other')$$,
  '42501', null, 'a non-follower cannot like a followers-only review');

-- A blocked user cannot like or comment on the blocker's public review.
reset role;
update public.community_reviews set visibility = 'public'
  where id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_blocked","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.community_comments (review_id, user_id, body)
    values ('11111111-1111-1111-1111-111111111111', 'user_blocked', 'spam')$$,
  '42501', null, 'a blocked user cannot comment');

-- Anyone not blocked can like a public review.
select set_config('request.jwt.claims', '{"sub":"user_other","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.community_review_likes (review_id, user_id)
    values ('11111111-1111-1111-1111-111111111111', 'user_other')$$,
  'a visible public review can be liked');

-- The anonymous role reads no profile and no like.
reset role;
set local role anon;
select is((select count(*)::int from public.community_profiles), 0, 'anon reads no profile');
select is((select count(*)::int from public.community_review_likes), 0, 'anon reads no like');

-- The followed user cannot rewrite who follows whom.
reset role;
insert into public.community_follows (follower_id, following_id, status)
values ('user_other', 'user_owner', 'pending');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_owner","role":"authenticated"}', true);
select throws_ok(
  $$update public.community_follows set follower_id = 'user_blocked'
    where following_id = 'user_owner'$$,
  null, 'A follow row cannot change its follower or followee',
  'the followee cannot reassign the follower');

select * from finish();
rollback;
