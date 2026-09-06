import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { staggerDelayMs } from "@/shared/utils/animation";

export function SectionHeader({
  title,
  subtitle,
  action,
  index,
  size = "default",
  isPageTitle = false,
  headingLevel,
  icon: Icon,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  index?: number;
  // "sub" is for a header nested inside a larger zone (e.g. the Today Hub
  // grouping several daily-relevant cards under one heading) — smaller
  // type, no eyebrow rule. Purely visual: see headingLevel below for the
  // actual heading tag this renders.
  size?: "default" | "sub";
  // Set when this is the page's own title (no other heading precedes it on
  // the page) — renders <h1> at text-page-title, the same size every page
  // that hand-rolls its own <h1> (Movies, Series, People, Tracking, Watch
  // Tonight, Stats) already uses, instead of the smaller text-heading-lg
  // every other SectionHeader renders. Never combine with size="sub": a
  // page title is never a nested zone.
  isPageTitle?: boolean;
  // Overrides the heading level size would otherwise imply (1 for
  // isPageTitle, 3 for size="sub", 2 otherwise). Needed when a page's
  // "sub"-styled sections sit directly under that same page's own <h1>
  // with nothing at <h2> in between — e.g. Settings' UI Preferences/
  // Streaming/Account/... sections, which want the smaller "sub" visual
  // treatment but must render <h2> so the outline doesn't skip a level.
  headingLevel?: 1 | 2 | 3;
  // Only meaningful with isPageTitle — a handful of page titles (Series,
  // Movies, Tracking) carry a leading glyph; every other page title omits
  // it rather than half-adopting the pattern.
  icon?: LucideIcon;
  className?: string;
}) {
  const sectionDelay = index !== undefined ? staggerDelayMs(index) : 0;
  const isSub = size === "sub";
  const level = headingLevel ?? (isPageTitle ? 1 : isSub ? 3 : 2);
  const Heading = `h${level}` as const;
  // A page title is never a nested zone, so it never draws the eyebrow
  // rule — even if a caller mistakenly also passes `index`.
  const showRule = !isSub && !isPageTitle && index !== undefined;

  return (
    <div className={cn("group", isSub ? "mb-4" : "mb-6", className)}>
      {showRule && (
        <div className="mb-3 flex items-center gap-3">
          <div className="section-rule w-10 transition-all duration-medium group-hover:w-16" />
        </div>
      )}
      <div className="flex items-end justify-between gap-4">
        <div className="animate-in" style={{ animationDelay: `${sectionDelay}ms` }}>
          <div className="flex items-center gap-3">
            {Icon ? <Icon className="size-7 shrink-0 text-primary" aria-hidden="true" /> : null}
            <Heading
              className={cn(
                "font-display tracking-tight transition-all duration-base group-hover:text-primary/90",
                isSub ? "text-heading-sm md:text-heading-md" : isPageTitle ? "text-page-title" : "text-heading-lg"
              )}
            >
              {title}
            </Heading>
          </div>
          {subtitle ? (
            <p
              className={cn(
                "text-muted-foreground transition-colors duration-base group-hover:text-muted-foreground/80",
                isSub ? "mt-1 text-caption" : "mt-1.5 text-body-sm"
              )}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {action}
      </div>
    </div>
  );
}
