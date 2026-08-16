import { describe, expect, it } from "vitest";
import { cn } from "../cn";

describe("cn", () => {
  // Regression test: tailwind-merge's default config only recognizes
  // Tailwind's stock text-xs..text-9xl keywords as "font-size" — an
  // unrecognized text-{key} (our custom scale from tailwind.config.ts:
  // display-hero/display-title/heading-*/body*/caption/overline) fell
  // through to the "text-color" group's catch-all instead, so combining one
  // with an actual text color in the same cn() call silently dropped the
  // color. This broke every Badge using the "movie"/"series" variant
  // (bg-primary/80 text-primary-foreground) alongside text-overline.
  it("keeps a text color when combined with the custom text-overline/text-caption font sizes", () => {
    expect(cn("text-primary-foreground", "text-overline")).toContain("text-primary-foreground");
    expect(cn("text-accent-foreground", "text-caption")).toContain("text-accent-foreground");
  });

  it("still lets a later font-size utility override an earlier one, custom or stock", () => {
    expect(cn("text-xs", "text-overline")).not.toContain("text-xs");
    expect(cn("text-overline", "text-caption")).not.toContain("text-overline");
  });
});
