import confetti from "canvas-confetti";

const BRAND_COLORS = ["#667eea", "#a78bfa", "#f093fb", "#4facfe", "#43e97b", "#f5576c"];

export function useConfetti() {
  /** Small burst from the center — for a single episode watched */
  const burst = (originX = 0.5, originY = 0.6) => {
    confetti({
      particleCount: 60,
      spread: 55,
      origin: { x: originX, y: originY },
      colors: BRAND_COLORS,
      scalar: 0.85,
      ticks: 180,
    });
  };

  /** Big celebration — season or movie complete */
  const celebrate = () => {
    const fire = (angle: number, originX: number) => {
      confetti({
        particleCount: 80,
        angle,
        spread: 60,
        origin: { x: originX, y: 0.65 },
        colors: BRAND_COLORS,
        scalar: 0.9,
        ticks: 220,
      });
    };
    fire(60, 0.1);
    fire(120, 0.9);
    setTimeout(() => {
      confetti({
        particleCount: 50,
        spread: 80,
        origin: { x: 0.5, y: 0.55 },
        colors: BRAND_COLORS,
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
