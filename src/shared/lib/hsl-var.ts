/** Builds a `hsl(var(--token))` reference to a semantic color token, for the handful of places (Recharts props, canvas-less inline styles) that can't take a Tailwind class and need a raw CSS color string instead. */
export function hslVar(token: string, alpha?: number): string {
  return alpha === undefined ? `hsl(var(--${token}))` : `hsl(var(--${token}) / ${alpha})`;
}
