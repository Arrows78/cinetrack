import { describe, expect, it, vi } from "vitest";
import { downloadWrappedCard } from "../wrapped-export";

describe("downloadWrappedCard", () => {
  it("triggers a download anchor named after the wrapped year and revokes the object URL", () => {
    const blob = new Blob(["fake-png"], { type: "image/png" });
    const objectUrl = "blob:mock-url";
    const createObjectURL = vi.fn(() => objectUrl);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    const anchor = document.createElement("a");
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => undefined);
    vi.spyOn(document, "createElement").mockReturnValueOnce(anchor);

    downloadWrappedCard(blob, 2026);

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.href).toBe(objectUrl);
    expect(anchor.download).toBe("cinetrack-wrapped-2026.png");
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl);

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
