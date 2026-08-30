-- Private account identity used to restore the local profile on a new device.
-- This is intentionally separate from community_profiles: joining the social
-- layer is optional and must never be required for private multi-device sync.
create table if not exists public.account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_profiles enable row level security;

create policy account_profiles_owner_select on public.account_profiles
  for select using (auth.uid() = user_id);
create policy account_profiles_owner_insert on public.account_profiles
  for insert with check (auth.uid() = user_id);
create policy account_profiles_owner_update on public.account_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy account_profiles_owner_delete on public.account_profiles
  for delete using (auth.uid() = user_id);
