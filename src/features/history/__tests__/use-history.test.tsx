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
  it("loads history from the repository", async () => {
    const { useHistory } = await import("../use-history");
    const { result } = renderHook(() => useHistory(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([item]);
    expect(listMock).toHaveBeenCalled();
  });
});
