import { useEffect, useState } from "react";

const COARSE_POINTER_QUERY = "(pointer: coarse)";

/**
 * Gates touch-only affordances (swipe-to-mark-seen, pull-to-refresh) so a
 * mouse/trackpad user never has a drag gesture hijacking a click or a
 * scroll. `pointer: coarse` (not viewport width) is what actually
 * distinguishes "the primary input is a finger" — a touch-capable laptop
 * kept wide still reports coarse if that's what's used, and a phone-sized
 * browser window on a desktop with a mouse correctly stays false. Listens
 * for changes rather than reading once, since a 2-in-1 can flip between
 * tablet and laptop mode without a reload.
 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(
    () => typeof window !== "undefined" && window.matchMedia(COARSE_POINTER_QUERY).matches
  );

  useEffect(() => {
    const query = window.matchMedia(COARSE_POINTER_QUERY);
    const applyMatch = () => setIsTouch(query.matches);
    applyMatch();
    query.addEventListener("change", applyMatch);
    return () => query.removeEventListener("change", applyMatch);
  }, []);

  return isTouch;
}
