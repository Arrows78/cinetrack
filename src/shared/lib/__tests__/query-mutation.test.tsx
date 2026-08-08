import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { useInvalidatingMutation } from "../query-mutation";

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useInvalidatingMutation", () => {
  it("invalidates a static list of query keys on success", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const mutationFn = vi.fn(async (value: string) => value.toUpperCase());

    const { result } = renderHook(
      () =>
        useInvalidatingMutation(mutationFn, [
          ["local", "a"],
          ["local", "b"],
        ]),
      {
        wrapper: createWrapper(client),
      }
    );

    await act(async () => {
      await result.current.mutateAsync("hi");
    });

    expect(mutationFn.mock.calls[0]?.[0]).toBe("hi");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["local", "a"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["local", "b"] });
  });

  it("derives query keys from the mutation's data and variables", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const mutationFn = vi.fn(async (seriesId: number) => ({ ok: true, seriesId }));

    const { result } = renderHook(
      () =>
        useInvalidatingMutation(mutationFn, (data, seriesId) => [
          ["local", "series", seriesId],
          ["local", "confirmed", data.seriesId],
        ]),
      { wrapper: createWrapper(client) }
    );

    await act(async () => {
      await result.current.mutateAsync(42);
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["local", "series", 42] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["local", "confirmed", 42] });
    });
  });

  it("does not invalidate anything when the mutation fails", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const mutationFn = vi.fn(async () => {
      throw new Error("nope");
    });

    const { result } = renderHook(() => useInvalidatingMutation(mutationFn, [["local", "a"]]), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await expect(result.current.mutateAsync(undefined)).rejects.toThrow("nope");
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
