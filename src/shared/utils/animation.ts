/** Caps a per-item entrance delay so long lists don't stay invisible for seconds. */
export const staggerDelayMs = (index: number, step = 100, max = 800): number => Math.min(index * step, max);
