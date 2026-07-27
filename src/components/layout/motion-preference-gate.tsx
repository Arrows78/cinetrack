import type { PropsWithChildren } from "react";
import { MotionConfig } from "framer-motion";
import { usePreferences } from "@/features/preferences/use-preferences";

/**
 * Framer Motion drives its animations via JS (direct style/transform
 * updates), not native CSS transitions — the CSS-based reduce-motion
 * override in styles/index.css can't reach it. MotionConfig is Framer
 * Motion's own documented mechanism for this: reducedMotion="always"
 * collapses transitions to their end state across every descendant
 * motion.* component.
 */
export function MotionPreferenceGate({ children }: PropsWithChildren) {
  const { data: preferences } = usePreferences();

  return <MotionConfig reducedMotion={preferences?.reduceMotion ? "always" : "never"}>{children}</MotionConfig>;
}
