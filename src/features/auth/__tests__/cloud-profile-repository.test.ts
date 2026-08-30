import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthClientMock } = vi.hoisted(() => ({ getAuthClientMock: vi.fn() }));
vi.mock("@/features/auth/auth-client", () => ({ getAuthClient: () => getAuthClientMock() }));

import { cloudProfileRepository } from "@/features/auth/cloud-profile-repository";

function makeClient(profile: unknown = { user_id: "user-1", display_name: "Alice", avatar_path: "avatar.png" }) {
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

  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
    from: vi.fn(() => builder),
  };

  return {
    client,
    builder,
    fail(error: Error) {
      response = { data: null, error };
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("cloudProfileRepository", () => {
  it("reads and maps the private account profile", async () => {
    const { client } = makeClient();
    getAuthClientMock.mockResolvedValue(client);

    await expect(cloudProfileRepository.get()).resolves.toEqual({
      userId: "user-1",
      displayName: "Alice",
      avatarPath: "avatar.png",
    });
  });

  it("returns null when no account profile has been seeded yet", async () => {
    const { client } = makeClient(null);
    getAuthClientMock.mockResolvedValue(client);
    await expect(cloudProfileRepository.get()).resolves.toBeNull();
  });

  it("trims and persists the local profile identity", async () => {
    const { client, builder } = makeClient();
    getAuthClientMock.mockResolvedValue(client);

    await cloudProfileRepository.save(" Alice ", "avatar.png");
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", display_name: "Alice", avatar_path: "avatar.png" })
    );
  });

  it("rejects missing configuration, auth errors and missing users", async () => {
    getAuthClientMock.mockResolvedValueOnce(null);
    await expect(cloudProfileRepository.get()).rejects.toThrow("Supabase is not configured");

    const authFailure = makeClient();
    const failure = new Error("auth failed");
    authFailure.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: failure });
    getAuthClientMock.mockResolvedValueOnce(authFailure.client);
    await expect(cloudProfileRepository.get()).rejects.toBe(failure);

    const noUser = makeClient();
    noUser.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    getAuthClientMock.mockResolvedValueOnce(noUser.client);
    await expect(cloudProfileRepository.get()).rejects.toThrow("Authentication required");
  });

  it("surfaces account profile read and write failures", async () => {
    const readFailure = makeClient();
    const firstError = new Error("read failed");
    readFailure.fail(firstError);
    getAuthClientMock.mockResolvedValueOnce(readFailure.client);
    await expect(cloudProfileRepository.get()).rejects.toBe(firstError);

    const writeFailure = makeClient();
    const secondError = new Error("write failed");
    writeFailure.fail(secondError);
    getAuthClientMock.mockResolvedValueOnce(writeFailure.client);
    await expect(cloudProfileRepository.save("Alice")).rejects.toBe(secondError);
  });
});
