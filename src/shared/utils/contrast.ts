/**
 * WCAG relative-luminance contrast, computed from HSL strings ("252 80% 42%")
 * the way every color token in styles/index.css is written. Used by the
 * design-system catalog to show real, live contrast ratios instead of
 * hand-typed numbers in a comment that can drift out of sync with the
 * tokens — that drift is exactly what caused the two failing color pairs
 * (--accent-foreground, --success-foreground) this function caught.
 */

function relativeLuminance(h: number, s: number, l: number): number {
  const s1 = s / 100;
  const l1 = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s1 * Math.min(l1, 1 - l1);
  const f = (n: number) => l1 - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  // WCAG's current sRGB transfer threshold is 0.04045. The historical
  // 0.03928 value changes ordinary 8-bit colors only imperceptibly, but using
  // the current constant keeps this utility aligned with the specification.
  const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * channel(f(0)) + 0.7152 * channel(f(8)) + 0.0722 * channel(f(4));
}

export function parseHsl(value: string): [number, number, number] | null {
  const parts = value
    .trim()
    .split(/\s+/)
    .map((part) => parseFloat(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;

  const [hue, saturation, lightness] = parts as [number, number, number];
  if (saturation < 0 || saturation > 100 || lightness < 0 || lightness > 100) return null;

  // CSS accepts wrapped hue values (for example -30deg or 390deg). Normalize
  // the unitless degree value so equivalent colors always produce the same
  // result while keeping the token format intentionally small and strict.
  return [((hue % 360) + 360) % 360, saturation, lightness];
}

export function contrastRatio(hsl1: string, hsl2: string): number | null {
  const a = parseHsl(hsl1);
  const b = parseHsl(hsl2);
  if (!a || !b) return null;
  const l1 = relativeLuminance(...a);
  const l2 = relativeLuminance(...b);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

export type WcagLevel = "AAA" | "AA" | "Fail";

export function wcagLevel(ratio: number): WcagLevel {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  return "Fail";
}
