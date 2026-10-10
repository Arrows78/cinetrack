import { defineCommand } from "@/shared/lib/invoke";
import type { UserProfile } from "@/types/media";

// Every `supabaseUserId` field/command name below carries Clerk's user id
// ("user_xxx", the JWT `sub`) since the Clerk migration — kept unrenamed
// deliberately, see profiles/models.rs's doc comment in src-tauri and
// docs/auth.md's Clerk migration section.
type CreateProfileArgs = {
  name: string;
  avatar: string | null;
  supabaseUserId: string | null;
};

type SupabaseUserArgs = {
  supabaseUserId: string;
};

type LinkProfileArgs = {
  profileId: string;
  supabaseUserId: string;
};

// `currentPin` unlocks a PIN-protected profile that isn't the active one —
// the Rust commands refuse to touch it otherwise (see
// authorize_pin_protected_access in profiles/repository.rs).
type RemoveProfileArgs = {
  profileId: string;
  currentPin: string | null;
};

type UpdateProfileArgs = {
  profileId: string;
  name: string;
  avatar: string | null;
  currentPin: string | null;
};

type ProfilePinArgs = {
  profileId: string;
  pin: string;
};

type SetProfilePinArgs = ProfilePinArgs & {
  currentPin: string | null;
};

type ClearProfilePinArgs = {
  profileId: string;
  currentPin: string | null;
};

export const profileCommands = {
  list: defineCommand<undefined, UserProfile[]>("list_profiles"),
  create: defineCommand<CreateProfileArgs, UserProfile>("create_profile"),
  findBySupabaseUserId: defineCommand<SupabaseUserArgs, UserProfile | null>("find_profile_by_supabase_user_id"),
  linkToSupabaseUser: defineCommand<LinkProfileArgs, UserProfile>("link_profile_to_supabase_user"),
  resolveForSupabaseUser: defineCommand<SupabaseUserArgs, UserProfile | null>("resolve_profile_for_supabase_user"),
  update: defineCommand<UpdateProfileArgs, UserProfile>("update_profile"),
  remove: defineCommand<RemoveProfileArgs, void>("remove_profile"),
  setPin: defineCommand<SetProfilePinArgs, UserProfile>("set_profile_pin"),
  clearPin: defineCommand<ClearProfilePinArgs, UserProfile>("clear_profile_pin"),
  verifyPin: defineCommand<ProfilePinArgs, boolean>("verify_profile_pin"),
} as const;
