-- Community RLS hardening.
--
--   * A like or a comment is only accepted on a review the caller may see
--     (public, or followers-only from an accepted follower, and no block in
--     either direction). Until now the INSERT policies checked ownership only,
--     so a blocked user kept notifying the review owner through the
--     SECURITY DEFINER notify triggers, and any user could comment on a
--     followers-only review whose id they knew.
--   * Likes are only readable on a review the caller may see.
--   * The profiles, follows and likes read policies no longer apply to the
--     anonymous role: with the publishable key alone, anyone could scrape
--     handles, the private-account flag, the follow graph and every like.
--   * A follow row's follower and followee can no longer be rewritten by the
--     followed user (the UPDATE policy only checked following_id).

-- 1. Reads and writes of likes follow the review's visibility.
drop policy if exists community_review_likes_read on public.community_review_likes;
create policy community_review_likes_read on public.community_review_likes
  for select to authenticated using (
    exists (
      select 1 from public.community_reviews r
      where r.id = review_id
        and r.deleted_at is null
        and public.can_view_community_content(r.user_id, r.visibility)
    )
  );

drop policy if exists community_review_likes_write on public.community_review_likes;
create policy community_review_likes_write on public.community_review_likes
  for insert to authenticated with check (
    (select requesting_user_id()) = user_id
    and exists (
      select 1 from public.community_reviews r
      where r.id = review_id
        and r.deleted_at is null
        and public.can_view_community_content(r.user_id, r.visibility)
    )
  );

-- 2. Comments: the owner may always edit or delete their own, but a new one
--    needs a visible review.
drop policy if exists community_comments_owner_write on public.community_comments;
create policy community_comments_insert on public.community_comments
  for insert to authenticated with check (
    (select requesting_user_id()) = user_id
    and exists (
      select 1 from public.community_reviews r
      where r.id = review_id
        and r.deleted_at is null
        and public.can_view_community_content(r.user_id, r.visibility)
    )
  );
create policy community_comments_owner_update on public.community_comments
  for update to authenticated
  using ((select requesting_user_id()) = user_id)
  with check ((select requesting_user_id()) = user_id);
create policy community_comments_owner_delete on public.community_comments
  for delete to authenticated using ((select requesting_user_id()) = user_id);

-- 3. No anonymous reads of the social graph.
alter policy community_profiles_read on public.community_profiles to authenticated;
alter policy community_follows_visible on public.community_follows to authenticated;

-- 4. Accepting or refusing a follow must not rewrite who follows whom.
create or replace function public.community_follows_guard_update()
returns trigger language plpgsql as $$
begin
  if new.follower_id is distinct from old.follower_id
     or new.following_id is distinct from old.following_id then
    raise exception 'A follow row cannot change its follower or followee';
  end if;
  return new;
end
$$;

drop trigger if exists community_follows_guard_update on public.community_follows;
create trigger community_follows_guard_update
  before update on public.community_follows
  for each row execute function public.community_follows_guard_update();
