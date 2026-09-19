-- Clerk-based identity for sync_*, community_* and account_profiles.
--
-- Supabase Auth is being replaced by Clerk as the identity provider (see
-- docs/auth.md). Clerk issues JWTs whose `sub` claim looks like
-- "user_xxxxxxxx" (a string, not a UUID), and Clerk users never populate
-- Supabase's own auth.users table. So:
--   * every identity column that used to be `uuid references auth.users(id)`
--     becomes a plain `text` column with the FK dropped;
--   * every RLS policy/function that read `auth.uid()` reads
--     `requesting_user_id()` instead (extracts the JWT `sub` claim directly,
--     which works for any third-party-auth issuer Supabase is configured to
--     trust, not just Clerk).
--
-- This is a one-shot cutover, not an additive change: once applied, rows
-- previously owned by a Supabase Auth uuid are orphaned from RLS's point of
-- view (their user_id no longer matches any JWT sub this project issues).
-- Only run this before any real user has synced data under a Supabase
-- Auth-issued uuid — see docs/auth.md's Clerk migration section for the
-- reconciliation a later cutover would require.

-- ---------------------------------------------------------------------------
-- 1. Shared helper: extract the JWT `sub` claim regardless of issuer.
-- ---------------------------------------------------------------------------
create or replace function public.requesting_user_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')
$$;

-- ---------------------------------------------------------------------------
-- 2. Drop every policy that depends on an identity column or on auth.uid() —
--    ALTER COLUMN TYPE below refuses to run while a policy depends on the
--    column being altered. All are recreated in step 5.
-- ---------------------------------------------------------------------------
drop policy if exists sync_devices_owner on public.sync_devices;
drop policy if exists sync_documents_owner on public.sync_documents;
drop policy if exists sync_changes_owner on public.sync_changes;
drop policy if exists sync_mutations_owner on public.sync_mutations;

drop policy if exists community_profiles_read on public.community_profiles;
drop policy if exists community_profiles_owner_write on public.community_profiles;
drop policy if exists community_follows_visible on public.community_follows;
drop policy if exists community_follows_create on public.community_follows;
drop policy if exists community_follows_delete on public.community_follows;
drop policy if exists community_follows_accept on public.community_follows;
drop policy if exists community_blocks_owner on public.community_blocks;
drop policy if exists community_reviews_read on public.community_reviews;
drop policy if exists community_reviews_owner_write on public.community_reviews;
drop policy if exists community_review_likes_read on public.community_review_likes;
drop policy if exists community_review_likes_write on public.community_review_likes;
drop policy if exists community_review_likes_delete on public.community_review_likes;
drop policy if exists community_comments_read on public.community_comments;
drop policy if exists community_comments_owner_write on public.community_comments;
drop policy if exists community_lists_read on public.community_public_lists;
drop policy if exists community_lists_owner_write on public.community_public_lists;
drop policy if exists community_list_items_read on public.community_public_list_items;
drop policy if exists community_list_items_owner_write on public.community_public_list_items;
drop policy if exists community_activities_read on public.community_activities;
drop policy if exists community_activities_owner_write on public.community_activities;
drop policy if exists community_notifications_owner on public.community_notifications;
drop policy if exists community_notifications_owner_update on public.community_notifications;
drop policy if exists community_reports_create on public.community_reports;
drop policy if exists community_mutes_owner on public.community_mutes;
drop policy if exists account_profiles_owner_select on public.account_profiles;
drop policy if exists account_profiles_owner_insert on public.account_profiles;
drop policy if exists account_profiles_owner_update on public.account_profiles;
drop policy if exists account_profiles_owner_delete on public.account_profiles;

-- can_view_community_content's signature changes (uuid -> text parameter),
-- so it must be dropped rather than `create or replace`d.
drop function if exists public.can_view_community_content(uuid, text);

-- ---------------------------------------------------------------------------
-- 3. Drop FK constraints to auth.users — Clerk users never populate it.
--    Constraint names are Postgres's default `<table>_<column>_fkey` for an
--    inline column-level `references` clause.
-- ---------------------------------------------------------------------------
alter table public.sync_devices drop constraint if exists sync_devices_user_id_fkey;
alter table public.sync_documents drop constraint if exists sync_documents_user_id_fkey;
alter table public.sync_changes drop constraint if exists sync_changes_user_id_fkey;
alter table public.sync_mutations drop constraint if exists sync_mutations_user_id_fkey;
alter table public.community_profiles drop constraint if exists community_profiles_user_id_fkey;
alter table public.community_follows drop constraint if exists community_follows_follower_id_fkey;
alter table public.community_follows drop constraint if exists community_follows_following_id_fkey;
alter table public.community_blocks drop constraint if exists community_blocks_blocker_id_fkey;
alter table public.community_blocks drop constraint if exists community_blocks_blocked_id_fkey;
alter table public.community_reviews drop constraint if exists community_reviews_user_id_fkey;
alter table public.community_review_likes drop constraint if exists community_review_likes_user_id_fkey;
alter table public.community_comments drop constraint if exists community_comments_user_id_fkey;
alter table public.community_public_lists drop constraint if exists community_public_lists_user_id_fkey;
alter table public.community_activities drop constraint if exists community_activities_user_id_fkey;
alter table public.community_notifications drop constraint if exists community_notifications_user_id_fkey;
alter table public.community_notifications drop constraint if exists community_notifications_actor_id_fkey;
alter table public.community_reports drop constraint if exists community_reports_reporter_id_fkey;
alter table public.community_mutes drop constraint if exists community_mutes_muter_id_fkey;
alter table public.community_mutes drop constraint if exists community_mutes_muted_id_fkey;
alter table public.account_profiles drop constraint if exists account_profiles_user_id_fkey;

-- ---------------------------------------------------------------------------
-- 4. Convert every identity column from uuid to text.
-- ---------------------------------------------------------------------------
alter table public.sync_devices alter column user_id type text using user_id::text;
alter table public.sync_documents alter column user_id type text using user_id::text;
alter table public.sync_changes alter column user_id type text using user_id::text;
alter table public.sync_mutations alter column user_id type text using user_id::text;
alter table public.community_profiles alter column user_id type text using user_id::text;
alter table public.community_follows alter column follower_id type text using follower_id::text;
alter table public.community_follows alter column following_id type text using following_id::text;
alter table public.community_blocks alter column blocker_id type text using blocker_id::text;
alter table public.community_blocks alter column blocked_id type text using blocked_id::text;
alter table public.community_reviews alter column user_id type text using user_id::text;
alter table public.community_review_likes alter column user_id type text using user_id::text;
alter table public.community_comments alter column user_id type text using user_id::text;
alter table public.community_public_lists alter column user_id type text using user_id::text;
alter table public.community_activities alter column user_id type text using user_id::text;
alter table public.community_notifications alter column user_id type text using user_id::text;
alter table public.community_notifications alter column actor_id type text using actor_id::text;
alter table public.community_reports alter column reporter_id type text using reporter_id::text;
alter table public.community_mutes alter column muter_id type text using muter_id::text;
alter table public.community_mutes alter column muted_id type text using muted_id::text;
alter table public.account_profiles alter column user_id type text using user_id::text;

-- ---------------------------------------------------------------------------
-- 5. Recreate policies and the visibility helper against
--    requesting_user_id() instead of auth.uid().
-- ---------------------------------------------------------------------------
create policy sync_devices_owner on public.sync_devices
  for all using (requesting_user_id() = user_id) with check (requesting_user_id() = user_id);
create policy sync_documents_owner on public.sync_documents
  for all using (requesting_user_id() = user_id) with check (requesting_user_id() = user_id);
create policy sync_changes_owner on public.sync_changes
  for select using (requesting_user_id() = user_id);
create policy sync_mutations_owner on public.sync_mutations
  for select using (requesting_user_id() = user_id);

create policy community_profiles_read on public.community_profiles
  for select using (
    requesting_user_id() = user_id
    or not exists (
      select 1 from public.community_blocks b
      where (b.blocker_id = requesting_user_id() and b.blocked_id = user_id)
         or (b.blocker_id = user_id and b.blocked_id = requesting_user_id())
    )
  );
create policy community_profiles_owner_write on public.community_profiles
  for all using (requesting_user_id() = user_id) with check (requesting_user_id() = user_id);

create policy community_follows_visible on public.community_follows
  for select using (requesting_user_id() in (follower_id, following_id) or status = 'accepted');
create policy community_follows_create on public.community_follows
  for insert with check (requesting_user_id() = follower_id);
create policy community_follows_delete on public.community_follows
  for delete using (requesting_user_id() in (follower_id, following_id));
create policy community_follows_accept on public.community_follows
  for update using (requesting_user_id() = following_id) with check (requesting_user_id() = following_id);

create policy community_blocks_owner on public.community_blocks
  for all using (requesting_user_id() = blocker_id) with check (requesting_user_id() = blocker_id);

create or replace function public.can_view_community_content(p_owner text, p_visibility text)
returns boolean language sql stable security definer set search_path = public as $$
  select requesting_user_id() = p_owner
    or (
      not exists (
        select 1 from public.community_blocks b
        where (b.blocker_id = requesting_user_id() and b.blocked_id = p_owner)
           or (b.blocker_id = p_owner and b.blocked_id = requesting_user_id())
      )
      and (
        p_visibility = 'public'
        or (
          p_visibility = 'followers'
          and exists (
            select 1 from public.community_follows f
            where f.follower_id = requesting_user_id()
              and f.following_id = p_owner
              and f.status = 'accepted'
          )
        )
      )
    )
$$;

create policy community_reviews_read on public.community_reviews
  for select using (deleted_at is null and public.can_view_community_content(user_id, visibility));
create policy community_reviews_owner_write on public.community_reviews
  for all using (requesting_user_id() = user_id) with check (requesting_user_id() = user_id);

create policy community_review_likes_read on public.community_review_likes for select using (true);
create policy community_review_likes_write on public.community_review_likes
  for insert with check (requesting_user_id() = user_id);
create policy community_review_likes_delete on public.community_review_likes
  for delete using (requesting_user_id() = user_id);

create policy community_comments_read on public.community_comments
  for select using (
    deleted_at is null and exists (
      select 1 from public.community_reviews r
      where r.id = review_id and public.can_view_community_content(r.user_id, r.visibility)
    )
  );
create policy community_comments_owner_write on public.community_comments
  for all using (requesting_user_id() = user_id) with check (requesting_user_id() = user_id);

create policy community_lists_read on public.community_public_lists
  for select using (deleted_at is null and public.can_view_community_content(user_id, 'public'));
create policy community_lists_owner_write on public.community_public_lists
  for all using (requesting_user_id() = user_id) with check (requesting_user_id() = user_id);
create policy community_list_items_read on public.community_public_list_items
  for select using (exists (
    select 1 from public.community_public_lists l
    where l.id = list_id and l.deleted_at is null
      and public.can_view_community_content(l.user_id, 'public')
  ));
create policy community_list_items_owner_write on public.community_public_list_items
  for all using (exists (
    select 1 from public.community_public_lists l
    where l.id = list_id and l.user_id = requesting_user_id()
  )) with check (exists (
    select 1 from public.community_public_lists l
    where l.id = list_id and l.user_id = requesting_user_id()
  ));

create policy community_activities_read on public.community_activities
  for select using (public.can_view_community_content(user_id, visibility));
create policy community_activities_owner_write on public.community_activities
  for all using (requesting_user_id() = user_id) with check (requesting_user_id() = user_id);

create policy community_notifications_owner on public.community_notifications
  for select using (requesting_user_id() = user_id);
create policy community_notifications_owner_update on public.community_notifications
  for update using (requesting_user_id() = user_id) with check (requesting_user_id() = user_id);

create policy community_reports_create on public.community_reports
  for insert with check (requesting_user_id() = reporter_id);

create policy community_mutes_owner on public.community_mutes
  for all using (requesting_user_id() = muter_id) with check (requesting_user_id() = muter_id);

create policy account_profiles_owner_select on public.account_profiles
  for select using (requesting_user_id() = user_id);
create policy account_profiles_owner_insert on public.account_profiles
  for insert with check (requesting_user_id() = user_id);
create policy account_profiles_owner_update on public.account_profiles
  for update using (requesting_user_id() = user_id) with check (requesting_user_id() = user_id);
create policy account_profiles_owner_delete on public.account_profiles
  for delete using (requesting_user_id() = user_id);

-- ---------------------------------------------------------------------------
-- 6. Recreate security definer / trigger functions that read auth.uid()
--    internally, or that hold locally-typed uuid variables for these tables.
-- ---------------------------------------------------------------------------
create or replace function public.apply_sync_batch(
  p_device_id text,
  p_mutations jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user text := requesting_user_id();
  v_mutation jsonb;
  v_mutation_id text;
  v_entity_type text;
  v_entity_id text;
  v_operation text;
  v_base_version bigint;
  v_current public.sync_documents%rowtype;
  v_new_version bigint;
  v_existing_version bigint;
  v_sequence bigint;
  v_acks jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;
  if p_device_id is null or length(trim(p_device_id)) = 0 then
    raise exception 'device id required';
  end if;
  if jsonb_typeof(coalesce(p_mutations, '[]'::jsonb)) <> 'array' then
    raise exception 'p_mutations must be an array';
  end if;
  if jsonb_array_length(coalesce(p_mutations, '[]'::jsonb)) > 200 then
    raise exception 'batch too large';
  end if;

  insert into public.sync_devices(user_id, device_id, last_seen_at)
  values (v_user, p_device_id, now())
  on conflict (user_id, device_id)
  do update set last_seen_at = excluded.last_seen_at;

  for v_mutation in select value from jsonb_array_elements(coalesce(p_mutations, '[]'::jsonb))
  loop
    v_mutation_id := v_mutation->>'mutationId';
    v_entity_type := v_mutation->>'entityType';
    v_entity_id := v_mutation->>'entityId';
    v_operation := v_mutation->>'operation';
    v_base_version := coalesce((v_mutation->>'baseVersion')::bigint, 0);

    if v_mutation_id is null or v_entity_id is null then
      raise exception 'mutationId and entityId are required';
    end if;
    if v_entity_type not in (
      'library_item', 'seen_movie', 'episode_progress', 'tracked_series',
      'viewing_event', 'custom_list', 'custom_list_item', 'smart_list',
      'saved_filter', 'availability_alert', 'account_preferences'
    ) then
      raise exception 'unsupported entity type: %', v_entity_type;
    end if;
    if v_operation not in ('upsert', 'delete') then
      raise exception 'unsupported operation: %', v_operation;
    end if;

    select resulting_version into v_existing_version
    from public.sync_mutations
    where user_id = v_user and mutation_id = v_mutation_id;

    if found then
      v_acks := v_acks || jsonb_build_array(jsonb_build_object(
        'mutationId', v_mutation_id,
        'entityType', v_entity_type,
        'entityId', v_entity_id,
        'version', v_existing_version,
        'deduplicated', true
      ));
      continue;
    end if;

    select * into v_current
    from public.sync_documents
    where user_id = v_user
      and entity_type = v_entity_type
      and entity_id = v_entity_id
    for update;

    if found and v_current.version <> v_base_version then
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'mutationId', v_mutation_id,
        'entityType', v_entity_type,
        'entityId', v_entity_id,
        'serverVersion', v_current.version,
        'serverDeleted', v_current.deleted_at is not null,
        'serverData', v_current.data
      ));
      continue;
    end if;

    if not found and v_base_version <> 0 then
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'mutationId', v_mutation_id,
        'entityType', v_entity_type,
        'entityId', v_entity_id,
        'serverVersion', 0,
        'serverDeleted', true,
        'serverData', null
      ));
      continue;
    end if;

    v_new_version := case when v_current.version is null then 1 else v_current.version + 1 end;

    insert into public.sync_documents(user_id, entity_type, entity_id, data, version, deleted_at, updated_at)
    values (
      v_user,
      v_entity_type,
      v_entity_id,
      case when v_operation = 'delete' then null else v_mutation->'payload' end,
      v_new_version,
      case when v_operation = 'delete' then now() else null end,
      now()
    )
    on conflict (user_id, entity_type, entity_id)
    do update set
      data = excluded.data,
      version = excluded.version,
      deleted_at = excluded.deleted_at,
      updated_at = excluded.updated_at;

    insert into public.sync_changes(user_id, entity_type, entity_id, operation, version, data)
    values (
      v_user,
      v_entity_type,
      v_entity_id,
      v_operation,
      v_new_version,
      case when v_operation = 'delete' then null else v_mutation->'payload' end
    ) returning sequence into v_sequence;

    insert into public.sync_mutations(
      user_id, mutation_id, device_id, entity_type, entity_id, resulting_version
    ) values (
      v_user, v_mutation_id, p_device_id, v_entity_type, v_entity_id, v_new_version
    );

    v_acks := v_acks || jsonb_build_array(jsonb_build_object(
      'mutationId', v_mutation_id,
      'entityType', v_entity_type,
      'entityId', v_entity_id,
      'version', v_new_version,
      'sequence', v_sequence,
      'deduplicated', false
    ));
  end loop;

  return jsonb_build_object(
    'acks', v_acks,
    'conflicts', v_conflicts,
    'cursor', coalesce((select max(sequence) from public.sync_changes where user_id = v_user), 0)
  );
end;
$$;

create or replace function public.pull_sync_changes(
  p_after bigint default 0,
  p_limit integer default 200
) returns table (
  sequence bigint,
  entity_type text,
  entity_id text,
  operation text,
  version bigint,
  data jsonb,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select c.sequence, c.entity_type, c.entity_id, c.operation, c.version, c.data, c.created_at
  from public.sync_changes c
  where c.user_id = requesting_user_id()
    and c.sequence > greatest(coalesce(p_after, 0), 0)
  order by c.sequence asc
  limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;

-- Private-account follow requests are normalized server-side so a client
-- cannot self-approve by posting status='accepted'.
create or replace function public.community_normalize_follow()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  target_private boolean;
begin
  if new.follower_id <> requesting_user_id() then
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

create or replace function public.community_notify_review_like()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  owner text;
begin
  select user_id into owner from public.community_reviews where id = new.review_id;
  if owner is not null and owner <> new.user_id then
    insert into public.community_notifications(user_id, actor_id, notification_type, object_id)
    values (owner, new.user_id, 'review_like', new.review_id);
  end if;
  return new;
end $$;

create or replace function public.community_notify_comment()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  owner text;
begin
  select user_id into owner from public.community_reviews where id = new.review_id;
  if owner is not null and owner <> new.user_id then
    insert into public.community_notifications(user_id, actor_id, notification_type, object_id)
    values (owner, new.user_id, 'comment', new.review_id);
  end if;
  return new;
end $$;

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
    a.user_id = requesting_user_id()
    or exists (
      select 1 from public.community_follows f
      where f.follower_id = requesting_user_id()
        and f.following_id = a.user_id
        and f.status = 'accepted'
    )
  )
  and not exists (
    select 1 from public.community_mutes m
    where m.muter_id = requesting_user_id() and m.muted_id = a.user_id
  )
  and (p_before is null or a.created_at < p_before)
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit,30),1),100)
$$;
