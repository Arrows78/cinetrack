import { describe, expect, it } from "vitest";
import { matchAlertProviderIds } from "../alert-providers";

describe("matchAlertProviderIds", () => {
  it("keeps only the providers the alert selected", () => {
    expect(matchAlertProviderIds([8], [119], [8, 119, 337])).toEqual([8]);
  });

  it("falls back to the profile's own services when the alert selected none", () => {
    expect(matchAlertProviderIds([], [119], [8, 119])).toEqual([119]);
  });

  it("accepts any provider when neither the alert nor the profile names one", () => {
    expect(matchAlertProviderIds([], [], [8, 119])).toEqual([8, 119]);
  });

  it("is empty when nothing offers the title", () => {
    expect(matchAlertProviderIds([8], [], [])).toEqual([]);
    expect(matchAlertProviderIds([], [], [])).toEqual([]);
  });

  it("never hands back the caller's own array", () => {
    const current = [8];
    expect(matchAlertProviderIds([], [], current)).not.toBe(current);
  });
});
