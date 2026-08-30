create table if not exists public.community_mutes (
  muter_id uuid not null references auth.users(id) on delete cascade,
  muted_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);

alter table public.community_mutes enable row level security;
create policy community_mutes_owner on public.community_mutes
  for all using (auth.uid() = muter_id) with check (auth.uid() = muter_id);

-- A block also removes any follow relationship in either direction.
create or replace function public.community_after_block()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  delete from public.community_follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end $$;

drop trigger if exists community_block_cleanup on public.community_blocks;
create trigger community_block_cleanup
after insert on public.community_blocks
for each row execute function public.community_after_block();

-- Private-account follow requests are normalized server-side so a client
-- cannot self-approve by posting status='accepted'.
create or replace function public.community_normalize_follow()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  target_private boolean;
begin
  if new.follower_id <> auth.uid() then
    raise exception 'follower_id must be the authenticated user';
  end if;
  if exists (
    select 1 from public.community_blocks b
    where (b.blocker_id = new.follower_id and b.blocked_id = new.following_id)
       or (b.blocker_id = new.following_id and b.blocked_id = new.follower_id)
  ) then
    raise exception 'follow blocked';
  end if;
  select is_private into target_private from public.community_profiles where user_id = new.following_id;
  new.status := case when coalesce(target_private, false) then 'pending' else 'accepted' end;
  return new;
end $$;

drop trigger if exists community_follow_normalize on public.community_follows;
create trigger community_follow_normalize
before insert on public.community_follows
for each row execute function public.community_normalize_follow();

create or replace function public.community_notify_follow()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.community_notifications(user_id, actor_id, notification_type)
  values (
    new.following_id,
    new.follower_id,
    case when new.status='pending' then 'follow_request' else 'follow' end
  );
  return new;
end $$;

drop trigger if exists community_follow_notify on public.community_follows;
create trigger community_follow_notify
after insert on public.community_follows
for each row execute function public.community_notify_follow();

create or replace function public.community_notify_review_like()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  owner uuid;
begin
  select user_id into owner from public.community_reviews where id = new.review_id;
  if owner is not null and owner <> new.user_id then
    insert into public.community_notifications(user_id, actor_id, notification_type, object_id)
    values (owner, new.user_id, 'review_like', new.review_id);
  end if;
  return new;
end $$;

drop trigger if exists community_review_like_notify on public.community_review_likes;
create trigger community_review_like_notify
after insert on public.community_review_likes
for each row execute function public.community_notify_review_like();

create or replace function public.community_notify_comment()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  owner uuid;
begin
  select user_id into owner from public.community_reviews where id = new.review_id;
  if owner is not null and owner <> new.user_id then
    insert into public.community_notifications(user_id, actor_id, notification_type, object_id)
    values (owner, new.user_id, 'comment', new.review_id);
  end if;
  return new;
end $$;

drop trigger if exists community_comment_notify on public.community_comments;
create trigger community_comment_notify
after insert on public.community_comments
for each row execute function public.community_notify_comment();

-- Chronological feed helper. RLS still applies to activities and follows;
-- muted accounts are removed here so every UI caller gets the same rule.
create or replace function public.community_feed(
  p_before timestamptz default null,
  p_limit integer default 30
) returns setof public.community_activities
language sql security invoker stable set search_path=public as $$
  select a.*
  from public.community_activities a
  where (
    a.user_id = auth.uid()
    or exists (
      select 1 from public.community_follows f
      where f.follower_id = auth.uid()
        and f.following_id = a.user_id
        and f.status = 'accepted'
    )
  )
  and not exists (
    select 1 from public.community_mutes m
    where m.muter_id = auth.uid() and m.muted_id = a.user_id
  )
  and (p_before is null or a.created_at < p_before)
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit,30),1),100)
$$;

grant execute on function public.community_feed(timestamptz, integer) to authenticated;

-- Notification rows are server-generated through SECURITY DEFINER triggers.
-- Keep direct INSERT unavailable to clients; only owner read/update policies
-- from the first migration are present.
