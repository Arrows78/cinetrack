import { useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/lib/cn";

interface TourStep {
  // Matches a `data-tour="..."` attribute on the target element (see
  // sidebar-nav.tsx) — a plain selector rather than refs, since the targets
  // live in a sibling component tree (AppShell's sidebar) this component
  // has no other handle on.
  target: string;
  titleKey: string;
  bodyKey: string;
}

const TOUR_STEPS: TourStep[] = [
  { target: "tour-library", titleKey: "onboarding.tour.library.title", bodyKey: "onboarding.tour.library.body" },
  {
    target: "tour-watch-tonight",
    titleKey: "onboarding.tour.watchTonight.title",
    bodyKey: "onboarding.tour.watchTonight.body",
  },
  { target: "tour-settings", titleKey: "onboarding.tour.settings.title", bodyKey: "onboarding.tour.settings.body" },
  {
    target: "tour-profile-switcher",
    titleKey: "onboarding.tour.profileSwitcher.title",
    bodyKey: "onboarding.tour.profileSwitcher.body",
  },
];

const TOOLTIP_WIDTH = 320;
const GAP = 12;
const RING_PADDING = 6;

function findVisibleTarget(target: string): HTMLElement | null {
  const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  // Filters out a `display:none` target — e.g. the desktop sidebar below
  // the `lg` breakpoint (see app-shell.tsx) — rather than pointing the tour
  // at something the user can't actually see. This app-shell split is live
  // in the shipped desktop build, not vestigial (see CLAUDE.md), so a
  // narrow window genuinely has no sidebar to highlight; the tour targets
  // the desktop sidebar only for now, kept deliberately minimal.
  return rect.width > 0 && rect.height > 0 ? element : null;
}

/**
 * Minimal spotlight tour: a dimmed backdrop, a highlight ring around the
 * current target (plain `ring`/box-shadow, not an SVG cutout mask — this
 * doesn't need to be fancier than that), and a positioned tooltip card with
 * Back/Next/Skip. Steps whose target isn't currently visible are dropped
 * up front; if that leaves nothing to show, this renders nothing and
 * doesn't call `onFinish` — see guided-tour usage in app-shell.tsx for why
 * that's safe to just retry on a later, wider-window launch.
 */
export function GuidedTour({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation();
  const [steps] = useState<{ step: TourStep; element: HTMLElement }[]>(() =>
    TOUR_STEPS.map((step) => {
      const element = findVisibleTarget(step.target);
      return element ? { step, element } : null;
    }).filter((entry): entry is { step: TourStep; element: HTMLElement } => entry !== null)
  );
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const current = steps[index];

  useLayoutEffect(() => {
    if (!current) return;
    const update = () => setRect(current.element.getBoundingClientRect());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [current]);

  // Escape always skips — a keyboard user shouldn't be trapped behind a
  // tour with no other way out short of clicking through every step.
  useEffect(() => {
    if (!current) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onFinish();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, onFinish]);

  if (!current || !rect) return null;

  const isLast = index === steps.length - 1;
  const placeBelow = rect.bottom + GAP + 140 <= window.innerHeight;
  const tooltipTop = placeBelow ? rect.bottom + GAP : Math.max(16, rect.top - GAP - 140);
  const tooltipLeft = Math.min(Math.max(16, rect.left), window.innerWidth - TOOLTIP_WIDTH - 16);

  return (
    <>
      <div className="fixed inset-0 z-command-palette bg-background/70" aria-hidden="true" />
      <div
        className="pointer-events-none fixed z-command-palette rounded-2xl ring-2 ring-primary ring-offset-2 ring-offset-background transition-all duration-200"
        style={{
          top: rect.top - RING_PADDING,
          left: rect.left - RING_PADDING,
          width: rect.width + RING_PADDING * 2,
          height: rect.height + RING_PADDING * 2,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(current.step.titleKey)}
        className={cn(
          "fixed z-command-palette rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-elevation-lg"
        )}
        style={{ top: tooltipTop, left: tooltipLeft, width: TOOLTIP_WIDTH }}
      >
        <p className="text-caption text-muted-foreground">
          {t("onboarding.tour.stepCounter", { current: index + 1, total: steps.length })}
        </p>
        <p className="mt-1 font-semibold">{t(current.step.titleKey)}</p>
        <p className="mt-1 text-body-sm text-muted-foreground">{t(current.step.bodyKey)}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onFinish}>
            {t("onboarding.tour.skip")}
          </Button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setIndex((current) => current - 1)}>
                {t("onboarding.tour.back")}
              </Button>
            )}
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => (isLast ? onFinish() : setIndex((current) => current + 1))}
            >
              {isLast ? t("onboarding.tour.done") : t("onboarding.tour.next")}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
