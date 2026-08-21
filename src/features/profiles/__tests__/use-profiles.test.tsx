import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { UserProfile } from "@/types/media";

const profile: UserProfile = { id: "profile-1", name: "Alice" } as UserProfile;

const listMock = vi.fn(async (): Promise<UserProfile[]> => [profile]);
const createMock = vi.fn<(name: string) => Promise<UserProfile>>(async () => profile);
const removeMock = vi.fn<(id: string) => Promise<void>>(async () => undefined);
const resolveForSupabaseUserMock = vi.fn<(supabaseUserId: string) => Promise<UserProfile | null>>(async () => profile);
const createForSupabaseUserMock = vi.fn<
  (name: string, supabaseUserId: string, avatar?: string | null) => Promise<UserProfile>
>(async () => profile);

vi.mock("@/features/profiles/profile-repository", () => ({
  profileRepository: {
    list: () => listMock(),
    create: (name: string) => createMock(name),
    remove: (id: string) => removeMock(id),
    resolveForSupabaseUser: (supabaseUserId: string) => resolveForSupabaseUserMock(supabaseUserId),
    createForSupabaseUser: (name: string, supabaseUserId: string, avatar?: string | null) =>
      createForSupabaseUserMock(name, supabaseUserId, avatar),
  },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  listMock.mockClear().mockResolvedValue([profile]);
  createMock.mockClear().mockResolvedValue(profile);
  removeMock.mockClear().mockResolvedValue(undefined);
  resolveForSupabaseUserMock.mockClear().mockResolvedValue(profile);
  createForSupabaseUserMock.mockClear().mockResolvedValue(profile);
});

describe("useProfileForSupabaseUser", () => {
  it("does not resolve a profile when supabaseUserId is undefined", async () => {
    const { useProfileForSupabaseUser } = await import("../use-profiles");
    const { result } = renderHook(() => useProfileForSupabaseUser(undefined), { wrapper: createWrapper() });

    await act(async () => {
      await Promise.resolve();
    });

    expect(resolveForSupabaseUserMock).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("resolves the profile once a real supabaseUserId is provided", async () => {
    const { useProfileForSupabaseUser } = await import("../use-profiles");
    const { result } = renderHook(() => useProfileForSupabaseUser("supa-user-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(resolveForSupabaseUserMock).toHaveBeenCalledWith("supa-user-1");
    expect(result.current.data).toEqual(profile);
  });
});

describe("useProfiles", () => {
  it("isSaving is true while create is pending, even though remove is idle", async () => {
    let resolveCreate!: (value: UserProfile) => void;
    createMock.mockImplementation(
      () =>
        new Promise<UserProfile>((resolve) => {
          resolveCreate = resolve;
        })
    );

    const { useProfiles } = await import("../use-profiles");
    const { result } = renderHook(() => useProfiles(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isSaving).toBe(false);

    let createPromise!: Promise<unknown>;
    act(() => {
      createPromise = result.current.create("Bob");
    });

    await waitFor(() => expect(result.current.isSaving).toBe(true));

    resolveCreate(profile);
    await act(async () => {
      await createPromise;
    });

    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });

  it("isSaving is true while remove is pending, even though create is idle", async () => {
    let resolveRemove!: () => void;
    removeMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRemove = resolve;
        })
    );

    const { useProfiles } = await import("../use-profiles");
    const { result } = renderHook(() => useProfiles(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isSaving).toBe(false);

    let removePromise!: Promise<unknown>;
    act(() => {
      removePromise = result.current.remove("profile-1");
    });

    await waitFor(() => expect(result.current.isSaving).toBe(true));

    resolveRemove();
    await act(async () => {
      await removePromise;
    });

    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });
});

describe("useCreateProfileForSupabaseUser", () => {
  it("creates a profile for the given supabase user and reports saving/error state", async () => {
    const { useCreateProfileForSupabaseUser } = await import("../use-profiles");
    const { result } = renderHook(() => useCreateProfileForSupabaseUser(), { wrapper: createWrapper() });

    expect(result.current.isSaving).toBe(false);
    expect(result.current.error).toBeNull();

    await act(async () => {
      await result.current.create({ name: "Alice", supabaseUserId: "supa-user-1", avatar: "avatar.png" });
    });

    expect(createForSupabaseUserMock).toHaveBeenCalledWith("Alice", "supa-user-1", "avatar.png");
    expect(result.current.isSaving).toBe(false);
  });
});
