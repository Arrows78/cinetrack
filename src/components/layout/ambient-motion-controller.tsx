import { useEffect } from "react";

/**
 * The `body::after` "breathe" animation (index.css) runs on an 8s infinite
 * CSS loop for as long as the app is open — including in a hidden/backgrounded
 * tab, where the browser still ticks it even though nothing is painted. This
 * pauses it via `animation-play-state` while the tab is hidden and resumes it
 * on return, independent of the reduce-motion preference (ThemeController)
 * which is a separate, user-controlled setting.
 */
export function AmbientMotionController() {
  useEffect(() => {
    const applyVisibility = () => {
      document.body.classList.toggle("tab-hidden", document.hidden);
    };

    applyVisibility();
    document.addEventListener("visibilitychange", applyVisibility);
    return () => document.removeEventListener("visibilitychange", applyVisibility);
  }, []);

  return null;
}
