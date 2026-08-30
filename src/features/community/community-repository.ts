import { getAuthClient } from "@/features/auth";

import type {
  CommunityActivity,
  CommunityComment,
  CommunityNotification,
  CommunityProfile,
  CommunityProfileInput,
  CommunityReview,
  PublishReviewInput,
} from "./community-types";

async function authenticated() {
  const client = await getAuthClient();
  if (!client) throw new Error("Supabase is not configured");
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Authentication required");
  return { client, user: data.user };
}

function profile(row: Record<string, unknown>): CommunityProfile {
  return {
    userId: String(row.user_id),
    handle: String(row.handle),
    displayName: String(row.display_name),
    avatarPath: (row.avatar_path as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    isPrivate: Boolean(row.is_private),
    activityVisibility: row.activity_visibility as CommunityProfile["activityVisibility"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function review(row: Record<string, unknown>): CommunityReview {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    mediaType: row.media_type as CommunityReview["mediaType"],
    mediaId: Number(row.media_id),
    rating: row.rating == null ? null : Number(row.rating),
    body: String(row.body),
    containsSpoilers: Boolean(row.contains_spoilers),
    visibility: row.visibility as CommunityReview["visibility"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export const communityRepository = {
  async getMyProfile(): Promise<CommunityProfile | null> {
    const { client, user } = await authenticated();
    const { data, error } = await client.from("community_profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return data ? profile(data as Record<string, unknown>) : null;
  },

  async getProfileByHandle(handle: string): Promise<CommunityProfile | null> {
    const { client } = await authenticated();
    const { data, error } = await client
      .from("community_profiles")
      .select("*")
      .eq("handle", handle.toLowerCase())
      .maybeSingle();
    if (error) throw error;
    return data ? profile(data as Record<string, unknown>) : null;
  },

  async saveMyProfile(input: CommunityProfileInput): Promise<CommunityProfile> {
    const { client, user } = await authenticated();
    const { data, error } = await client
      .from("community_profiles")
      .upsert({
        user_id: user.id,
        handle: input.handle.trim().toLowerCase(),
        display_name: input.displayName.trim(),
        avatar_path: input.avatarPath ?? null,
        bio: input.bio?.trim() || null,
        is_private: input.isPrivate ?? false,
        activity_visibility: input.activityVisibility ?? "followers",
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw error;
    return profile(data as Record<string, unknown>);
  },

  async follow(userId: string): Promise<void> {
    const { client, user } = await authenticated();
    const { error } = await client.from("community_follows").insert({ follower_id: user.id, following_id: userId });
    if (error) throw error;
  },

  async acceptFollow(followerId: string): Promise<void> {
    const { client, user } = await authenticated();
    const { error } = await client
      .from("community_follows")
      .update({ status: "accepted" })
      .eq("follower_id", followerId)
      .eq("following_id", user.id)
      .eq("status", "pending");
    if (error) throw error;
  },

  async unfollow(userId: string): Promise<void> {
    const { client, user } = await authenticated();
    const { error } = await client
      .from("community_follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("following_id", userId);
    if (error) throw error;
  },

  async block(userId: string): Promise<void> {
    const { client, user } = await authenticated();
    const { error } = await client.from("community_blocks").upsert({ blocker_id: user.id, blocked_id: userId });
    if (error) throw error;
  },

  async unblock(userId: string): Promise<void> {
    const { client, user } = await authenticated();
    const { error } = await client.from("community_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", userId);
    if (error) throw error;
  },

  async mute(userId: string): Promise<void> {
    const { client, user } = await authenticated();
    const { error } = await client.from("community_mutes").upsert({ muter_id: user.id, muted_id: userId });
    if (error) throw error;
  },

  async unmute(userId: string): Promise<void> {
    const { client, user } = await authenticated();
    const { error } = await client.from("community_mutes").delete().eq("muter_id", user.id).eq("muted_id", userId);
    if (error) throw error;
  },

  async publishReview(input: PublishReviewInput): Promise<CommunityReview> {
    const { client, user } = await authenticated();
    const now = new Date().toISOString();
    const { data, error } = await client
      .from("community_reviews")
      .upsert(
        {
          user_id: user.id,
          media_type: input.mediaType,
          media_id: input.mediaId,
          rating: input.rating ?? null,
          body: input.body.trim(),
          contains_spoilers: input.containsSpoilers ?? false,
          visibility: input.visibility ?? "public",
          updated_at: now,
          deleted_at: null,
        },
        { onConflict: "user_id,media_type,media_id" }
      )
      .select("*")
      .single();
    if (error) throw error;

    const mapped = review(data as Record<string, unknown>);
    await client.from("community_activities").insert({
      user_id: user.id,
      activity_type: "review_published",
      media_type: input.mediaType,
      media_id: input.mediaId,
      object_id: mapped.id,
      visibility: input.visibility ?? "public",
      payload: {},
    });
    return mapped;
  },

  async listReviews(mediaType: "movie" | "series", mediaId: number, limit = 30): Promise<CommunityReview[]> {
    const { client } = await authenticated();
    const { data, error } = await client
      .from("community_reviews")
      .select("*")
      .eq("media_type", mediaType)
      .eq("media_id", mediaId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100));
    if (error) throw error;
    return (data ?? []).map((row) => review(row as Record<string, unknown>));
  },

  async likeReview(reviewId: string): Promise<void> {
    const { client, user } = await authenticated();
    const { error } = await client.from("community_review_likes").upsert({ review_id: reviewId, user_id: user.id });
    if (error) throw error;
  },

  async unlikeReview(reviewId: string): Promise<void> {
    const { client, user } = await authenticated();
    const { error } = await client
      .from("community_review_likes")
      .delete()
      .eq("review_id", reviewId)
      .eq("user_id", user.id);
    if (error) throw error;
  },

  async addComment(reviewId: string, body: string): Promise<CommunityComment> {
    const { client, user } = await authenticated();
    const { data, error } = await client
      .from("community_comments")
      .insert({
        review_id: reviewId,
        user_id: user.id,
        body: body.trim(),
      })
      .select("*")
      .single();
    if (error) throw error;
    return {
      id: data.id,
      reviewId: data.review_id,
      userId: data.user_id,
      body: data.body,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  },

  async listComments(reviewId: string): Promise<CommunityComment[]> {
    const { client } = await authenticated();
    const { data, error } = await client
      .from("community_comments")
      .select("*")
      .eq("review_id", reviewId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      reviewId: row.review_id,
      userId: row.user_id,
      body: row.body,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  async feed(before?: string, limit = 30): Promise<CommunityActivity[]> {
    const { client } = await authenticated();
    const { data, error } = await client.rpc("community_feed", {
      p_before: before ?? null,
      p_limit: Math.min(Math.max(limit, 1), 100),
    });
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      activityType: row.activity_type as CommunityActivity["activityType"],
      mediaType: (row.media_type as CommunityActivity["mediaType"]) ?? null,
      mediaId: row.media_id == null ? null : Number(row.media_id),
      objectId: (row.object_id as string | null) ?? null,
      visibility: row.visibility as CommunityActivity["visibility"],
      payload: (row.payload ?? {}) as Record<string, unknown>,
      createdAt: String(row.created_at),
    }));
  },

  async notifications(limit = 50): Promise<CommunityNotification[]> {
    const { client, user } = await authenticated();
    const { data, error } = await client
      .from("community_notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100));
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      actorId: row.actor_id,
      notificationType: row.notification_type,
      objectId: row.object_id,
      createdAt: row.created_at,
      readAt: row.read_at,
    }));
  },

  async markNotificationRead(notificationId: string): Promise<void> {
    const { client, user } = await authenticated();
    const { error } = await client
      .from("community_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", user.id);
    if (error) throw error;
  },

  async report(targetType: "profile" | "review" | "comment" | "list", targetId: string, reason: string): Promise<void> {
    const { client, user } = await authenticated();
    const { error } = await client.from("community_reports").insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason: reason.trim(),
    });
    if (error) throw error;
  },
};
