import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { CalendarEntry } from "@/types/media";

const entries: CalendarEntry[] = [
  { id: "entry-1", date: "2026-02-01", kind: "episode", mediaId: 1, mediaType: "series", title: "Test Show" },
];

const buildMock = vi.fn(async () => entries);

vi.mock("@/features/calendar/calendar-service", () => ({
  calendarService: { build: buildMock },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useCalendar", () => {
  it("loads the calendar built by calendarService", async () => {
    const { useCalendar } = await import("../use-calendar");
    const { result } = renderHook(() => useCalendar(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(entries);
    expect(buildMock).toHaveBeenCalled();
  });
});
