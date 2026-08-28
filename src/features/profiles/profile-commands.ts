import { defineCommand } from "@/shared/lib/invoke";
import type { UserProfile } from "@/types/media";

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

type RemoveProfileArgs = {
  profileId: string;
};

export const profileCommands = {
  list: defineCommand<undefined, UserProfile[]>("list_profiles"),
  create: defineCommand<CreateProfileArgs, UserProfile>("create_profile"),
  findBySupabaseUserId: defineCommand<SupabaseUserArgs, UserProfile | null>("find_profile_by_supabase_user_id"),
  linkToSupabaseUser: defineCommand<LinkProfileArgs, UserProfile>("link_profile_to_supabase_user"),
  resolveForSupabaseUser: defineCommand<SupabaseUserArgs, UserProfile | null>("resolve_profile_for_supabase_user"),
  remove: defineCommand<RemoveProfileArgs, void>("remove_profile"),
} as const;
