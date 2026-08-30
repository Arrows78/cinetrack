import { getAuthClient } from "./auth-client";

export type CloudAccountProfile = {
  userId: string;
  displayName: string;
  avatarPath: string | null;
};

async function clientAndUser() {
  const client = await getAuthClient();
  if (!client) throw new Error("Supabase is not configured");
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Authentication required");
  return { client, user: data.user };
}

export const cloudProfileRepository = {
  async get(): Promise<CloudAccountProfile | null> {
    const { client, user } = await clientAndUser();
    const { data, error } = await client.from("account_profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      userId: data.user_id,
      displayName: data.display_name,
      avatarPath: data.avatar_path,
    };
  },

  async save(displayName: string, avatarPath?: string | null): Promise<void> {
    const { client, user } = await clientAndUser();
    const { error } = await client.from("account_profiles").upsert({
      user_id: user.id,
      display_name: displayName.trim(),
      avatar_path: avatarPath ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  },
};
