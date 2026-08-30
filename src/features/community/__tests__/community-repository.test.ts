import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthClientMock } = vi.hoisted(() => ({ getAuthClientMock: vi.fn() }));

vi.mock("@/features/auth", () => ({ getAuthClient: () => getAuthClientMock() }));

import { communityRepository } from "@/features/community/community-repository";

const profileRow = {
  user_id: "user-1",
  handle: "alice",
  display_name: "Alice",
  avatar_path: null,
  bio: "Hello",
  is_private: false,
  activity_visibility: "followers",
  created_at: "2026-08-30T20:00:00.000Z",
  updated_at: "2026-08-30T20:00:00.000Z",
};

const reviewRow = {
  id: "review-1",
  user_id: "user-1",
  media_type: "movie",
  media_id: 42,
  rating: 9,
  body: "Great movie",
  contains_spoilers: false,
  visibility: "public",
  created_at: "2026-08-30T20:00:00.000Z",
  updated_at: "2026-08-30T20:00:00.000Z",
};

const commentRow = {
  id: "comment-1",
  review_id: "review-1",
  user_id: "user-1",
  body: "Nice",
  created_at: "2026-08-30T20:00:00.000Z",
  updated_at: "2026-08-30T20:00:00.000Z",
};

const notificationRow = {
  id: "notification-1",
  user_id: "user-1",
  actor_id: "user-2",
  notification_type: "follow",
  object_id: null,
  created_at: "2026-08-30T20:00:00.000Z",
  read_at: null,
};

type QueryResponse = { data: unknown; error: Error | null };

function makeClient() {
  const tableErrors = new Map<string, Error>();
  const builders: Array<{ table: string; calls: Record<string, ReturnType<typeof vi.fn>> }> = [];

  const responseFor = (table: string, single: boolean): QueryResponse => {
    const error = tableErrors.get(table) ?? null;
    if (error) return { data: null, error };
    if (table === "community_profiles") return { data: profileRow, error: null };
    if (table === "community_reviews") return { data: single ? reviewRow : [reviewRow], error: null };
    if (table === "community_comments") return { data: single ? commentRow : [commentRow], error: null };
    if (table === "community_notifications") return { data: [notificationRow], error: null };
    return { data: null, error: null };
  };

  const from = vi.fn((table: string) => {
    const calls = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
      upsert: vi.fn(),
      single: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      is: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
    };
    const builder = {
      select: calls.select,
      eq: calls.eq,
      maybeSingle: calls.maybeSingle,
      upsert: calls.upsert,
      single: calls.single,
      insert: calls.insert,
      update: calls.update,
      delete: calls.delete,
      is: calls.is,
      order: calls.order,
      limit: calls.limit,
      then: (onFulfilled: (value: QueryResponse) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(responseFor(table, false)).then(onFulfilled, onRejected),
    };
    for (const method of ["select", "eq", "upsert", "insert", "update", "delete", "is", "order", "limit"] as const) {
      calls[method].mockImplementation(() => builder);
    }
    calls.maybeSingle.mockImplementation(() => Promise.resolve(responseFor(table, true)));
    calls.single.mockImplementation(() => Promise.resolve(responseFor(table, true)));
    builders.push({ table, calls });
    return builder;
  });

  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
    from,
    rpc: vi.fn().mockResolvedValue({
      data: [
        {
          id: "activity-1",
          user_id: "user-2",
          activity_type: "review_published",
          media_type: "movie",
          media_id: 42,
          object_id: "review-1",
          visibility: "public",
          payload: {},
          created_at: "2026-08-30T20:00:00.000Z",
        },
      ],
      error: null,
    }),
  };

  return { client, tableErrors, builders };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("communityRepository", () => {
  it("covers the complete successful social data workflow", async () => {
    const { client, builders } = makeClient();
    getAuthClientMock.mockResolvedValue(client);

    await expect(communityRepository.getMyProfile()).resolves.toMatchObject({ userId: "user-1", handle: "alice" });
    await expect(communityRepository.getProfileByHandle("ALICE")).resolves.toMatchObject({ displayName: "Alice" });
    await expect(
      communityRepository.saveMyProfile({
        handle: " Alice ",
        displayName: " Alice ",
        bio: " Hello ",
        isPrivate: true,
        activityVisibility: "private",
      })
    ).resolves.toMatchObject({ userId: "user-1" });

    await communityRepository.follow("user-2");
    await communityRepository.acceptFollow("user-2");
    await communityRepository.unfollow("user-2");
    await communityRepository.block("user-2");
    await communityRepository.unblock("user-2");
    await communityRepository.mute("user-2");
    await communityRepository.unmute("user-2");

    await expect(
      communityRepository.publishReview({
        mediaType: "movie",
        mediaId: 42,
        rating: 9,
        body: " Great movie ",
        containsSpoilers: false,
      })
    ).resolves.toMatchObject({ id: "review-1", mediaId: 42, rating: 9 });
    await expect(communityRepository.listReviews("movie", 42, 999)).resolves.toHaveLength(1);
    await communityRepository.likeReview("review-1");
    await communityRepository.unlikeReview("review-1");
    await expect(communityRepository.addComment("review-1", " Nice ")).resolves.toMatchObject({ id: "comment-1" });
    await expect(communityRepository.listComments("review-1")).resolves.toHaveLength(1);
    await expect(communityRepository.feed(undefined, 999)).resolves.toEqual([
      expect.objectContaining({ id: "activity-1", userId: "user-2", mediaId: 42 }),
    ]);
    await expect(communityRepository.notifications(999)).resolves.toEqual([
      expect.objectContaining({ id: "notification-1", notificationType: "follow" }),
    ]);
    await communityRepository.markNotificationRead("notification-1");
    await communityRepository.report("review", "review-1", " spam ");

    const profileUpsert = builders.find(
      ({ table, calls }) => table === "community_profiles" && (calls.upsert?.mock.calls.length ?? 0) > 0
    );
    expect(profileUpsert?.calls.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ handle: "alice", display_name: "Alice", bio: "Hello", is_private: true })
    );
    expect(client.rpc).toHaveBeenCalledWith("community_feed", { p_before: null, p_limit: 100 });
  });

  it("returns null when no community profile exists", async () => {
    const { client } = makeClient();
    const originalFrom = client.from;
    client.from = vi.fn((table: string) => {
      const builder = originalFrom(table);
      if (table === "community_profiles") {
        builder.maybeSingle.mockResolvedValue({ data: null, error: null });
      }
      return builder;
    });
    getAuthClientMock.mockResolvedValue(client);

    await expect(communityRepository.getMyProfile()).resolves.toBeNull();
  });

  it("rejects missing configuration, auth failures and unauthenticated sessions", async () => {
    getAuthClientMock.mockResolvedValueOnce(null);
    await expect(communityRepository.getMyProfile()).rejects.toThrow("Supabase is not configured");

    const authFailure = makeClient();
    const failure = new Error("auth failed");
    authFailure.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: failure });
    getAuthClientMock.mockResolvedValueOnce(authFailure.client);
    await expect(communityRepository.getMyProfile()).rejects.toBe(failure);

    const noUser = makeClient();
    noUser.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    getAuthClientMock.mockResolvedValueOnce(noUser.client);
    await expect(communityRepository.getMyProfile()).rejects.toThrow("Authentication required");
  });

  it("surfaces database and RPC failures", async () => {
    const database = makeClient();
    const databaseFailure = new Error("follow failed");
    database.tableErrors.set("community_follows", databaseFailure);
    getAuthClientMock.mockResolvedValueOnce(database.client);
    await expect(communityRepository.follow("user-2")).rejects.toBe(databaseFailure);

    const rpc = makeClient();
    const rpcFailure = new Error("feed failed");
    rpc.client.rpc.mockResolvedValue({ data: null, error: rpcFailure });
    getAuthClientMock.mockResolvedValueOnce(rpc.client);
    await expect(communityRepository.feed()).rejects.toBe(rpcFailure);
  });
});
