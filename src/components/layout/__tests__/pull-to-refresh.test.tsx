import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { PullToRefresh } from "../pull-to-refresh";

const useIsTouchDeviceMock = vi.fn();
vi.mock("@/hooks/use-is-touch-device", () => ({
  useIsTouchDevice: () => useIsTouchDeviceMock(),
}));

function setScrollY(value: number) {
  Object.defineProperty(window, "scrollY", { value, configurable: true, writable: true });
}

function dispatchTouch(type: "touchstart" | "touchmove" | "touchend", clientY?: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  if (clientY !== undefined) Object.defineProperty(event, "touches", { value: [{ clientY }] });
  window.dispatchEvent(event);
}

function renderWithClient(children: React.ReactNode, client: QueryClient) {
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

function Wrapper({ children }: PropsWithChildren) {
  return <>{children}</>;
}

describe("PullToRefresh", () => {
  beforeEach(() => {
    setScrollY(0);
  });

  afterEach(() => {
    useIsTouchDeviceMock.mockReset();
  });

  it("renders children unwrapped, with no gesture handling, on a non-touch device", () => {
    useIsTouchDeviceMock.mockReturnValue(false);
    const client = new QueryClient();
    const refetchSpy = vi.spyOn(client, "refetchQueries");

    renderWithClient(
      <PullToRefresh>
        <Wrapper>content</Wrapper>
      </PullToRefresh>,
      client
    );
    expect(screen.getByText("content")).toBeInTheDocument();

    dispatchTouch("touchstart", 0);
    dispatchTouch("touchmove", 200);
    dispatchTouch("touchend");

    expect(refetchSpy).not.toHaveBeenCalled();
  });

  it("refetches active queries when pulled past the threshold from the top of the page", async () => {
    useIsTouchDeviceMock.mockReturnValue(true);
    const client = new QueryClient();
    const refetchSpy = vi.spyOn(client, "refetchQueries").mockResolvedValue(undefined);

    renderWithClient(<PullToRefresh>content</PullToRefresh>, client);

    dispatchTouch("touchstart", 0);
    dispatchTouch("touchmove", 300);
    dispatchTouch("touchend");

    await waitFor(() => expect(refetchSpy).toHaveBeenCalledWith({ type: "active" }));
  });

  it("does not refetch when the pull distance stays below the threshold", () => {
    useIsTouchDeviceMock.mockReturnValue(true);
    const client = new QueryClient();
    const refetchSpy = vi.spyOn(client, "refetchQueries");

    renderWithClient(<PullToRefresh>content</PullToRefresh>, client);

    dispatchTouch("touchstart", 0);
    dispatchTouch("touchmove", 20);
    dispatchTouch("touchend");

    expect(refetchSpy).not.toHaveBeenCalled();
  });

  it("does not engage when the page is already scrolled down", () => {
    useIsTouchDeviceMock.mockReturnValue(true);
    setScrollY(120);
    const client = new QueryClient();
    const refetchSpy = vi.spyOn(client, "refetchQueries");

    renderWithClient(<PullToRefresh>content</PullToRefresh>, client);

    dispatchTouch("touchstart", 0);
    dispatchTouch("touchmove", 300);
    dispatchTouch("touchend");

    expect(refetchSpy).not.toHaveBeenCalled();
  });
});
