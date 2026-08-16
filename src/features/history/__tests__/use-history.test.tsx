import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { ViewingHistoryItem } from "@/types/media";

const item: ViewingHistoryItem = {
  id: "history-1",
  mediaId: 42,
  mediaType: "movie",
  title: "Test Movie",
  action: "movie:watched",
  timestamp: "2026-01-01T00:00:00.000Z",
};

const listMock = vi.fn(async () => [item]);

vi.mock("@/features/history/history-repository", () => ({
  historyRepository: { list: listMock },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useHistory", () => {
  it("loads the first page of history from the repository", async () => {
    const { useHistory } = await import("../use-history");
    const { result } = renderHook(() => useHistory(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.pages).toEqual([[item]]);
    expect(listMock).toHaveBeenCalledWith(50, undefined);
  });

  it("fetches the next page using the last item's timestamp/id as the cursor", async () => {
    const fullPage = Array.from({ length: 50 }, (_, index) => ({
      ...item,
      id: `history-${index}`,
      timestamp: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));
    listMock.mockResolvedValueOnce(fullPage).mockResolvedValueOnce([item]);

    const { useHistory } = await import("../use-history");
    const { result } = renderHook(() => useHistory(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(true);

    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

    const last = fullPage[fullPage.length - 1]!;
    expect(listMock).toHaveBeenLastCalledWith(50, { beforeTimestamp: last.timestamp, beforeId: last.id });
  });
});
