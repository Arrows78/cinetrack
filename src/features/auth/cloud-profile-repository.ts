import { getCurrentUserId, getDataClient } from "@/shared/lib/supabase-data-client";

export type CloudAccountProfile = {
  userId: string;
  displayName: string;
  avatarPath: string | null;
};

async function clientAndUserId() {
  const client = await getDataClient();
  if (!client) throw new Error("Supabase is not configured");
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Authentication required");
  return { client, userId };
}

export const cloudProfileRepository = {
  async get(): Promise<CloudAccountProfile | null> {
    const { client, userId } = await clientAndUserId();
    const { data, error } = await client.from("account_profiles").select("*").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      userId: data.user_id,
      displayName: data.display_name,
      avatarPath: data.avatar_path,
    };
  },

  async save(displayName: string, avatarPath?: string | null): Promise<void> {
    const { client, userId } = await clientAndUserId();
    const { error } = await client.from("account_profiles").upsert({
      user_id: userId,
      display_name: displayName.trim(),
      avatar_path: avatarPath ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  },
};
