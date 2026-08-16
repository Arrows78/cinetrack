import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { MediaSummary } from "@/types/media";

const media: MediaSummary = {
  id: 7,
  mediaType: "movie",
  title: "Test Movie",
  overview: "",
  genres: [],
  cast: [],
};

const hasMock = vi.fn<() => Promise<boolean>>(async () => false);
const saveMock = vi.fn<(media: MediaSummary, patch: unknown) => Promise<undefined>>(async () => undefined);
const removeIfPlannedMock = vi.fn<(mediaId: number, mediaType: string) => Promise<boolean>>(async () => true);
const removeMock = vi.fn<(mediaId: number, mediaType: string) => Promise<undefined>>(async () => undefined);

vi.mock("@/features/library/library-repository", () => ({
  libraryRepository: {
    has: () => hasMock(),
    save: (media: MediaSummary, patch: unknown) => saveMock(media, patch),
    removeIfPlanned: (mediaId: number, mediaType: string) => removeIfPlannedMock(mediaId, mediaType),
    remove: (mediaId: number, mediaType: string) => removeMock(mediaId, mediaType),
  },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useAddToLibraryToggle", () => {
  beforeEach(() => {
    hasMock.mockClear();
    saveMock.mockClear();
    removeIfPlannedMock.mockClear().mockResolvedValue(true);
    removeMock.mockClear();
  });

  it("adds a title that isn't in the library yet, without asking for confirmation", async () => {
    hasMock.mockResolvedValue(false);
    const { useAddToLibraryToggle } = await import("../use-add-to-library-toggle");
    const { result } = renderHook(() => useAddToLibraryToggle(media), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isInLibrary).toBe(false));

    await act(async () => {
      await result.current.toggle();
    });

    expect(saveMock).toHaveBeenCalledWith(media, { status: "planned" });
    expect(result.current.confirmingForceRemove).toBe(false);
  });

  it("removes a still-planned title directly, without a confirmation dialog", async () => {
    hasMock.mockResolvedValue(true);
    removeIfPlannedMock.mockResolvedValue(true);
    const { useAddToLibraryToggle } = await import("../use-add-to-library-toggle");
    const { result } = renderHook(() => useAddToLibraryToggle(media), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isInLibrary).toBe(true));

    await act(async () => {
      await result.current.toggle();
    });

    expect(removeIfPlannedMock).toHaveBeenCalledWith(7, "movie");
    expect(result.current.confirmingForceRemove).toBe(false);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("opens the force-remove confirmation once removeIfPlanned reports real progress", async () => {
    hasMock.mockResolvedValue(true);
    removeIfPlannedMock.mockResolvedValue(false);
    const { useAddToLibraryToggle } = await import("../use-add-to-library-toggle");
    const { result } = renderHook(() => useAddToLibraryToggle(media), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isInLibrary).toBe(true));

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.confirmingForceRemove).toBe(true);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("confirmForceRemove runs the real delete and closes the dialog", async () => {
    hasMock.mockResolvedValue(true);
    removeIfPlannedMock.mockResolvedValue(false);
    const { useAddToLibraryToggle } = await import("../use-add-to-library-toggle");
    const { result } = renderHook(() => useAddToLibraryToggle(media), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isInLibrary).toBe(true));
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.confirmingForceRemove).toBe(true);

    act(() => {
      result.current.confirmForceRemove();
    });

    expect(result.current.confirmingForceRemove).toBe(false);
    await waitFor(() => expect(removeMock).toHaveBeenCalledWith(7, "movie"));
  });
});
