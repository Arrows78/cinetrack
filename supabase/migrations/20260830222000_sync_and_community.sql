-- CineTrack cloud sync + community foundation.
-- Apply with `supabase db push` or through the Supabase SQL editor.
--
-- Security model:
--   * sync_* tables are strictly private and scoped by auth.uid().
--   * community tables are explicit public projections.
--   * followers never receive direct access to private library/history rows.

create extension if not exists pgcrypto;

create table if not exists public.sync_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  label text,
  platform text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

create table if not exists public.sync_documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'library_item', 'seen_movie', 'episode_progress', 'tracked_series',
    'viewing_event', 'custom_list', 'custom_list_item', 'smart_list',
    'saved_filter', 'availability_alert', 'account_preferences'
  )),
  entity_id text not null,
  data jsonb,
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);

create index if not exists sync_documents_user_updated_idx
  on public.sync_documents(user_id, updated_at desc);

create table if not exists public.sync_changes (
  sequence bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  operation text not null check (operation in ('upsert', 'delete')),
  version bigint not null,
  data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sync_changes_user_sequence_idx
  on public.sync_changes(user_id, sequence);

create table if not exists public.sync_mutations (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id text not null,
  device_id text not null,
  entity_type text not null,
  entity_id text not null,
  resulting_version bigint not null,
  processed_at timestamptz not null default now(),
  primary key (user_id, mutation_id)
);

create index if not exists sync_mutations_user_processed_idx
  on public.sync_mutations(user_id, processed_at desc);

alter table public.sync_devices enable row level security;
alter table public.sync_documents enable row level security;
alter table public.sync_changes enable row level security;
alter table public.sync_mutations enable row level security;

create policy sync_devices_owner on public.sync_devices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sync_documents_owner on public.sync_documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sync_changes_owner on public.sync_changes
  for select using (auth.uid() = user_id);
create policy sync_mutations_owner on public.sync_mutations
  for select using (auth.uid() = user_id);

create or replace function public.apply_sync_batch(
  p_device_id text,
  p_mutations jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
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

revoke all on function public.apply_sync_batch(text, jsonb) from public;
grant execute on function public.apply_sync_batch(text, jsonb) to authenticated;

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
  where c.user_id = auth.uid()
    and c.sequence > greatest(coalesce(p_after, 0), 0)
  order by c.sequence asc
  limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;

revoke all on function public.pull_sync_changes(bigint, integer) from public;
grant execute on function public.pull_sync_changes(bigint, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Explicit community projection. Nothing below references sync_documents.
-- ---------------------------------------------------------------------------

create table if not exists public.community_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_path text,
  bio text check (char_length(bio) <= 280),
  is_private boolean not null default false,
  activity_visibility text not null default 'followers'
    check (activity_visibility in ('private', 'followers', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.community_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.community_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'series')),
  media_id integer not null,
  rating numeric(3,1) check (rating is null or rating between 1 and 10),
  body text not null check (char_length(body) between 1 and 5000),
  contains_spoilers boolean not null default false,
  visibility text not null default 'public' check (visibility in ('followers', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, media_type, media_id)
);

create index if not exists community_reviews_media_idx
  on public.community_reviews(media_type, media_id, created_at desc)
  where deleted_at is null;

create table if not exists public.community_review_likes (
  review_id uuid not null references public.community_reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.community_reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists community_comments_review_idx
  on public.community_comments(review_id, created_at asc)
  where deleted_at is null;

create table if not exists public.community_public_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_list_id text,
  name text not null check (char_length(name) between 1 and 100),
  description text check (char_length(description) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.community_public_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.community_public_lists(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'series')),
  media_id integer not null,
  title text not null,
  poster_path text,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  unique (list_id, media_type, media_id)
);

create table if not exists public.community_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null check (activity_type in (
    'media_completed', 'review_published', 'list_published', 'milestone'
  )),
  media_type text check (media_type in ('movie', 'series')),
  media_id integer,
  object_id uuid,
  visibility text not null default 'followers' check (visibility in ('followers', 'public')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists community_activities_user_created_idx
  on public.community_activities(user_id, created_at desc, id desc);

create table if not exists public.community_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'follow', 'follow_request', 'review_like', 'comment'
  )),
  object_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists community_notifications_user_unread_idx
  on public.community_notifications(user_id, read_at, created_at desc);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('profile', 'review', 'comment', 'list')),
  target_id text not null,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.community_profiles enable row level security;
alter table public.community_follows enable row level security;
alter table public.community_blocks enable row level security;
alter table public.community_reviews enable row level security;
alter table public.community_review_likes enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_public_lists enable row level security;
alter table public.community_public_list_items enable row level security;
alter table public.community_activities enable row level security;
alter table public.community_notifications enable row level security;
alter table public.community_reports enable row level security;

-- Public profiles are discoverable unless either side has blocked the other.
create policy community_profiles_read on public.community_profiles
  for select using (
    auth.uid() = user_id
    or not exists (
      select 1 from public.community_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = user_id)
         or (b.blocker_id = user_id and b.blocked_id = auth.uid())
    )
  );
create policy community_profiles_owner_write on public.community_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy community_follows_visible on public.community_follows
  for select using (auth.uid() in (follower_id, following_id) or status = 'accepted');
create policy community_follows_create on public.community_follows
  for insert with check (auth.uid() = follower_id);
create policy community_follows_delete on public.community_follows
  for delete using (auth.uid() in (follower_id, following_id));
create policy community_follows_accept on public.community_follows
  for update using (auth.uid() = following_id) with check (auth.uid() = following_id);

create policy community_blocks_owner on public.community_blocks
  for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

create or replace function public.can_view_community_content(p_owner uuid, p_visibility text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() = p_owner
    or (
      not exists (
        select 1 from public.community_blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = p_owner)
           or (b.blocker_id = p_owner and b.blocked_id = auth.uid())
      )
      and (
        p_visibility = 'public'
        or (
          p_visibility = 'followers'
          and exists (
            select 1 from public.community_follows f
            where f.follower_id = auth.uid()
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
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy community_review_likes_read on public.community_review_likes for select using (true);
create policy community_review_likes_write on public.community_review_likes
  for insert with check (auth.uid() = user_id);
create policy community_review_likes_delete on public.community_review_likes
  for delete using (auth.uid() = user_id);

create policy community_comments_read on public.community_comments
  for select using (
    deleted_at is null and exists (
      select 1 from public.community_reviews r
      where r.id = review_id and public.can_view_community_content(r.user_id, r.visibility)
    )
  );
create policy community_comments_owner_write on public.community_comments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy community_lists_read on public.community_public_lists
  for select using (deleted_at is null and public.can_view_community_content(user_id, 'public'));
create policy community_lists_owner_write on public.community_public_lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy community_list_items_read on public.community_public_list_items
  for select using (exists (
    select 1 from public.community_public_lists l
    where l.id = list_id and l.deleted_at is null
      and public.can_view_community_content(l.user_id, 'public')
  ));
create policy community_list_items_owner_write on public.community_public_list_items
  for all using (exists (
    select 1 from public.community_public_lists l
    where l.id = list_id and l.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.community_public_lists l
    where l.id = list_id and l.user_id = auth.uid()
  ));

create policy community_activities_read on public.community_activities
  for select using (public.can_view_community_content(user_id, visibility));
create policy community_activities_owner_write on public.community_activities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy community_notifications_owner on public.community_notifications
  for select using (auth.uid() = user_id);
create policy community_notifications_owner_update on public.community_notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy community_reports_create on public.community_reports
  for insert with check (auth.uid() = reporter_id);

-- Realtime is a wake-up signal only; durable convergence still uses the cursor RPC.
do $$
begin
  alter publication supabase_realtime add table public.sync_changes;
exception
  when duplicate_object then null;
end $$;

