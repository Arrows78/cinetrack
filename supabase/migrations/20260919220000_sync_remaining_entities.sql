-- Accept the remaining user-data entity types the desktop outbox already
-- queues (`dismissed_recommendation`) or now queues (`activity_log`).
-- Applied with `supabase db push` after 20260919120000_clerk_identity.sql.

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'sync_documents'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%entity_type%'
  loop
    execute format('alter table public.sync_documents drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.sync_documents
  add constraint sync_documents_entity_type_check
  check (entity_type in (
    'library_item', 'seen_movie', 'episode_progress', 'tracked_series',
    'viewing_event', 'custom_list', 'custom_list_item', 'smart_list',
    'saved_filter', 'availability_alert', 'account_preferences',
    'dismissed_recommendation', 'activity_log'
  ));

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
      'saved_filter', 'availability_alert', 'account_preferences',
      'dismissed_recommendation', 'activity_log'
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
