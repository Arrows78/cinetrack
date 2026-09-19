import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDataClientMock, getCurrentUserIdMock } = vi.hoisted(() => ({
  getDataClientMock: vi.fn(),
  getCurrentUserIdMock: vi.fn(),
}));
vi.mock("@/shared/lib/supabase-data-client", () => ({
  getDataClient: () => getDataClientMock(),
  getCurrentUserId: () => getCurrentUserIdMock(),
}));

import { cloudProfileRepository } from "@/features/auth/cloud-profile-repository";

function makeClient(profile: unknown = { user_id: "user_1", display_name: "Alice", avatar_path: "avatar.png" }) {
  let response = { data: profile, error: null as Error | null };
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    upsert: vi.fn(),
    then: (onFulfilled: (value: typeof response) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(onFulfilled, onRejected),
  };
  builder.select.mockImplementation(() => builder);
  builder.eq.mockImplementation(() => builder);
  builder.maybeSingle.mockImplementation(() => Promise.resolve(response));
  builder.upsert.mockImplementation(() => builder);

  const client = { from: vi.fn(() => builder) };

  return {
    client,
    builder,
    fail(error: Error) {
      response = { data: null, error };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserIdMock.mockReturnValue("user_1");
});

describe("cloudProfileRepository", () => {
  it("reads and maps the private account profile", async () => {
    const { client } = makeClient();
    getDataClientMock.mockResolvedValue(client);

    await expect(cloudProfileRepository.get()).resolves.toEqual({
      userId: "user_1",
      displayName: "Alice",
      avatarPath: "avatar.png",
    });
  });

  it("returns null when no account profile has been seeded yet", async () => {
    const { client } = makeClient(null);
    getDataClientMock.mockResolvedValue(client);
    await expect(cloudProfileRepository.get()).resolves.toBeNull();
  });

  it("trims and persists the local profile identity", async () => {
    const { client, builder } = makeClient();
    getDataClientMock.mockResolvedValue(client);

    await cloudProfileRepository.save(" Alice ", "avatar.png");
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user_1", display_name: "Alice", avatar_path: "avatar.png" })
    );
  });

  it("rejects missing configuration and a missing Clerk user id", async () => {
    getDataClientMock.mockResolvedValueOnce(null);
    await expect(cloudProfileRepository.get()).rejects.toThrow("Supabase is not configured");

    const { client } = makeClient();
    getDataClientMock.mockResolvedValueOnce(client);
    getCurrentUserIdMock.mockReturnValueOnce(null);
    await expect(cloudProfileRepository.get()).rejects.toThrow("Authentication required");
  });

  it("surfaces account profile read and write failures", async () => {
    const readFailure = makeClient();
    const firstError = new Error("read failed");
    readFailure.fail(firstError);
    getDataClientMock.mockResolvedValueOnce(readFailure.client);
    await expect(cloudProfileRepository.get()).rejects.toBe(firstError);

    const writeFailure = makeClient();
    const secondError = new Error("write failed");
    writeFailure.fail(secondError);
    getDataClientMock.mockResolvedValueOnce(writeFailure.client);
    await expect(cloudProfileRepository.save("Alice")).rejects.toBe(secondError);
  });
});
