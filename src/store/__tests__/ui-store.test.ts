import { describe, expect, it } from "vitest";
import { useUiStore } from "../ui-store";

describe("useUiStore", () => {
  it("starts with the mobile nav closed", () => {
    expect(useUiStore.getState().mobileNavOpen).toBe(false);
  });

  it("toggles mobileNavOpen via setMobileNavOpen", () => {
    useUiStore.getState().setMobileNavOpen(true);
    expect(useUiStore.getState().mobileNavOpen).toBe(true);

    useUiStore.getState().setMobileNavOpen(false);
    expect(useUiStore.getState().mobileNavOpen).toBe(false);
  });
});
