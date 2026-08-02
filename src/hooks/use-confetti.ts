import confetti from "canvas-confetti";

/**
 * Reads the *current* theme colors instead of a hardcoded palette — --primary
 * follows the user's chosen accent (see theme-controller.tsx), so someone who
 * picked "amber" as their accent sees amber confetti, not a fixed purple/pink
 * palette unrelated to anything they chose. --accent/--success/--warning are
 * read live too, for correctness (light vs dark mode uses different L values)
 * even though only --primary is user-configurable.
 */
function themeConfettiColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return [`hsl(${read("--primary")})`, `hsl(${read("--accent")})`, `hsl(${read("--success")})`, `hsl(${read("--warning")})`];
}

export function useConfetti() {
  /** Small burst from the center — for a single episode watched */
  const burst = (originX = 0.5, originY = 0.6) => {
    void confetti({
      particleCount: 60,
      spread: 55,
      origin: { x: originX, y: originY },
      colors: themeConfettiColors(),
      scalar: 0.85,
      ticks: 180,
    });
  };

  /** Big celebration — season or movie complete */
  const celebrate = () => {
    const colors = themeConfettiColors();
    const fire = (angle: number, originX: number) => {
      void confetti({
        particleCount: 80,
        angle,
        spread: 60,
        origin: { x: originX, y: 0.65 },
        colors,
        scalar: 0.9,
        ticks: 220,
      });
    };
    fire(60, 0.1);
    fire(120, 0.9);
    setTimeout(() => {
      void confetti({
        particleCount: 50,
        spread: 80,
        origin: { x: 0.5, y: 0.55 },
        colors,
        scalar: 0.8,
      });
    }, 150);
  };

  /** Fire from a DOM element's position */
  const burstFromRef = (el: HTMLElement | null) => {
    if (!el) return burst();
    const rect = el.getBoundingClientRect();
    burst((rect.left + rect.width / 2) / window.innerWidth, (rect.top + rect.height / 2) / window.innerHeight);
  };

  return { burst, celebrate, burstFromRef };
}
