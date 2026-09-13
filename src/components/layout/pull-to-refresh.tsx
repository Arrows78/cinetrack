import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { ArrowDown, LoaderCircle } from "lucide-react";
import { useIsTouchDevice } from "@/hooks/use-is-touch-device";
import { errorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";

// Distance (px) the content must be pulled before release triggers a
// refetch — below this it just springs back, same "deliberate gesture"
// idea as episode-card's own swipe threshold.
const PULL_TRIGGER_THRESHOLD_PX = 70;
// Hard cap on how far the indicator can be dragged, regardless of how far
// the finger travels — keeps the gesture feeling resisted rather than 1:1.
const PULL_MAX_PX = 110;
// Fraction of raw finger travel actually applied to the pull distance —
// the same "elastic, not 1:1" resistance framer-motion's own drag gestures
// get via dragElastic (see episode-card.tsx), reimplemented by hand here
// since this reads raw touch events instead of using `drag`.
const PULL_RESISTANCE = 0.5;

/**
 * Pull-to-refresh for the app's mobile layout — reads raw touch events
 * (rather than framer-motion's `drag`, which is built for draggable
 * elements, not an overscroll gesture) so it can tell "pulling down from
 * the very top of the page" apart from an ordinary scroll and only then
 * take over. Touch-only (see useIsTouchDevice): a mouse/trackpad user has
 * no equivalent gesture and every page's own data already refetches on
 * its usual triggers (focus, mutation, staleTime).
 *
 * Refetches every currently-mounted query rather than a page-specific list
 * — simplest correct behavior for a shell-level gesture that has no idea
 * which queries the page underneath it actually rendered.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isTouch = useIsTouchDevice();
  const [refreshing, setRefreshing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const pullDistance = useMotionValue(0);
  const indicatorOpacity = useTransform(pullDistance, [0, PULL_TRIGGER_THRESHOLD_PX], [0, 1]);
  const indicatorRotate = useTransform(pullDistance, [0, PULL_TRIGGER_THRESHOLD_PX], [0, 180]);
  const startY = useRef<number | null>(null);
  const triggered = useRef(false);

  useEffect(() => {
    if (!isTouch) return;

    const handleTouchStart = (event: TouchEvent) => {
      if (triggered.current) return;
      startY.current = window.scrollY <= 0 ? (event.touches[0]?.clientY ?? null) : null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (startY.current === null || triggered.current) return;
      const currentY = event.touches[0]?.clientY;
      if (currentY === undefined) return;
      const rawDelta = currentY - startY.current;
      if (rawDelta <= 0 || window.scrollY > 0) {
        startY.current = null;
        pullDistance.set(0);
        setPulling(false);
        return;
      }
      // Only now is this definitely our gesture, not a page scroll — safe
      // to stop the browser's own overscroll/rubber-band from also firing.
      event.preventDefault();
      setPulling(true);
      pullDistance.set(Math.min(rawDelta * PULL_RESISTANCE, PULL_MAX_PX));
    };

    const handleTouchEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      setPulling(false);
      if (pullDistance.get() >= PULL_TRIGGER_THRESHOLD_PX) {
        triggered.current = true;
        setRefreshing(true);
        queryClient
          .refetchQueries({ type: "active" })
          .catch((error: unknown) => logger.warn(`Pull-to-refresh failed: ${errorMessage(error)}`))
          .finally(() => {
            triggered.current = false;
            setRefreshing(false);
            animate(pullDistance, 0, { type: "spring", bounce: 0.2 });
          });
      } else {
        animate(pullDistance, 0, { type: "spring", bounce: 0.2 });
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isTouch, pullDistance, queryClient]);

  if (!isTouch) return <>{children}</>;

  const statusLabel = refreshing
    ? t("common.refreshing")
    : pulling
      ? t("common.releaseToRefresh")
      : t("common.pullToRefresh");

  return (
    <>
      <motion.div
        aria-hidden="true"
        style={{ opacity: indicatorOpacity, y: pullDistance }}
        className="pointer-events-none fixed left-1/2 top-[calc(0.5rem+env(safe-area-inset-top))] z-overlay flex size-9 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border border-border bg-card shadow-lg"
      >
        {refreshing ? (
          <LoaderCircle className="size-4 animate-spin text-primary" />
        ) : (
          <motion.div style={{ rotate: indicatorRotate }}>
            <ArrowDown className="size-4 text-muted-foreground" />
          </motion.div>
        )}
      </motion.div>
      <span role="status" aria-live="polite" className="sr-only">
        {pulling || refreshing ? statusLabel : ""}
      </span>
      <motion.div style={{ y: pullDistance }}>{children}</motion.div>
    </>
  );
}
