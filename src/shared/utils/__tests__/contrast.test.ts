// @vitest-environment node
//
// Pure math + filesystem assertions, no DOM needed. Required: under jsdom,
// import.meta.url resolves against jsdom's configured `location` instead of
// the real module file, so readFileSync(new URL(..., import.meta.url))
// throws "The URL must be of scheme file" (see catalog-data.test.ts for the
// same issue with the same fix).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLOR_PRESETS } from "@/shared/constants/colors";
import { contrastRatio, parseHsl, wcagLevel } from "../contrast";

const styles = readFileSync(new URL("../../../styles/index.css", import.meta.url), "utf8");

function readVariables(selector: string) {
  const match = styles.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Missing ${selector} token block`);

  return Object.fromEntries(
    [...match[1]!.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value!.trim()])
  );
}

const darkTokens = readVariables(":root");
const lightTokens = { ...darkTokens, ...readVariables(".light") };
const tokenPairs = [
  ["background", "foreground"],
  ["card", "card-foreground"],
  ["popover", "popover-foreground"],
  ["muted", "muted-foreground"],
  ["primary", "primary-foreground"],
  ["secondary", "secondary-foreground"],
  ["accent", "accent-foreground"],
  ["destructive", "destructive-foreground"],
  ["success", "success-foreground"],
  ["warning", "warning-foreground"],
] as const;

describe("parseHsl", () => {
  it("parses an HSL triplet string", () => {
    expect(parseHsl("252 80% 42%")).toEqual([252, 80, 42]);
  });

  it("returns null for malformed input", () => {
    expect(parseHsl("not a color")).toBeNull();
  });

  it("rejects out-of-range saturation and lightness", () => {
    expect(parseHsl("120 101% 50%")).toBeNull();
    expect(parseHsl("120 50% -1%")).toBeNull();
  });

  it("normalizes wrapped hue values", () => {
    expect(parseHsl("390 80% 42%")).toEqual([30, 80, 42]);
    expect(parseHsl("-30 80% 42%")).toEqual([330, 80, 42]);
  });
});

describe("contrastRatio", () => {
  it("gives the maximum 21:1 for pure black vs pure white", () => {
    expect(contrastRatio("0 0% 100%", "0 0% 0%")).toBeCloseTo(21, 0);
  });

  it("gives 1:1 for identical colors", () => {
    expect(contrastRatio("252 80% 42%", "252 80% 42%")).toBeCloseTo(1, 1);
  });

  it("matches the app's --destructive/--destructive-foreground pairing (dark mode)", () => {
    // Regression check for the two failures this function caught in styles/index.css:
    // --accent-foreground was 2.9:1 (dark-on-dark) and --success-foreground was 2.6:1
    // (white-on-medium-green) before being fixed. This case is a known-good pairing.
    expect(contrastRatio("0 72% 62%", "225 25% 10%")).toBeCloseTo(5.0, 1);
  });

  it("returns null when either input is malformed", () => {
    expect(contrastRatio("nonsense", "0 0% 0%")).toBeNull();
  });

  it("keeps every accent preset above the AA contract in both themes", () => {
    const darkForeground = "225 25% 10%";
    const lightForeground = "0 0% 98%";

    for (const [accent, preset] of Object.entries(COLOR_PRESETS)) {
      expect(contrastRatio(preset.dark, darkForeground), `${accent} dark`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(preset.light, lightForeground), `${accent} light`).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(preset.dark, darkTokens.background),
        `${accent} as text on dark background`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(preset.light, lightTokens.background),
        `${accent} as text on light background`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ["dark", darkTokens],
    ["light", lightTokens],
  ])("keeps every semantic token pair above AA in %s mode", (theme, tokens) => {
    for (const [background, foreground] of tokenPairs) {
      const ratio = contrastRatio(tokens[background], tokens[foreground]);
      expect(ratio, `${theme}: --${foreground} on --${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("wcagLevel", () => {
  it("classifies AAA at 7:1 and above", () => {
    expect(wcagLevel(7)).toBe("AAA");
    expect(wcagLevel(10)).toBe("AAA");
  });

  it("classifies AA between 4.5:1 and 7:1", () => {
    expect(wcagLevel(4.5)).toBe("AA");
    expect(wcagLevel(6.9)).toBe("AA");
  });

  it("classifies anything below 4.5:1 as a fail", () => {
    expect(wcagLevel(4.49)).toBe("Fail");
    expect(wcagLevel(1)).toBe("Fail");
  });
});
