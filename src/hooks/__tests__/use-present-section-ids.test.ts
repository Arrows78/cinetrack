import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePresentSectionIds } from "../use-present-section-ids";

describe("usePresentSectionIds", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns only the candidate ids currently present in the container", async () => {
    const container = document.createElement("div");
    container.innerHTML = '<div id="alpha"></div>';
    document.body.appendChild(container);
    const containerRef = { current: container };

    const { result } = renderHook(() => usePresentSectionIds(["alpha", "beta"], containerRef));

    await waitFor(() => expect(result.current).toEqual(["alpha"]));
  });

  it("picks up a section that mounts after the initial render", async () => {
    const container = document.createElement("div");
    container.innerHTML = '<div id="alpha"></div>';
    document.body.appendChild(container);
    const containerRef = { current: container };

    const { result } = renderHook(() => usePresentSectionIds(["alpha", "beta"], containerRef));
    await waitFor(() => expect(result.current).toEqual(["alpha"]));

    const beta = document.createElement("div");
    beta.id = "beta";
    container.appendChild(beta);

    await waitFor(() => expect(result.current).toEqual(["alpha", "beta"]));
  });

  it("drops a section that unmounts", async () => {
    const container = document.createElement("div");
    const alpha = document.createElement("div");
    alpha.id = "alpha";
    container.appendChild(alpha);
    document.body.appendChild(container);
    const containerRef = { current: container };

    const { result } = renderHook(() => usePresentSectionIds(["alpha"], containerRef));
    await waitFor(() => expect(result.current).toEqual(["alpha"]));

    container.removeChild(alpha);

    await waitFor(() => expect(result.current).toEqual([]));
  });

  it("returns an empty list when the container ref isn't attached yet", () => {
    const containerRef = { current: null };
    const { result } = renderHook(() => usePresentSectionIds(["alpha"], containerRef));
    expect(result.current).toEqual([]);
  });
});
