import { describe, expect, it } from "vitest";
import { useUiStore } from "../ui-store";

describe("useUiStore", () => {
  it("starts with the more sheet closed", () => {
    expect(useUiStore.getState().moreSheetOpen).toBe(false);
  });

  it("toggles moreSheetOpen via setMoreSheetOpen", () => {
    useUiStore.getState().setMoreSheetOpen(true);
    expect(useUiStore.getState().moreSheetOpen).toBe(true);

    useUiStore.getState().setMoreSheetOpen(false);
    expect(useUiStore.getState().moreSheetOpen).toBe(false);
  });
});
