import type * as React from "react";
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
  // the page) — renders <h1>, same visual size otherwise. Never combine
  // with size="sub": a page title is never a nested zone.
  isPageTitle?: boolean;
  // Overrides the heading level size would otherwise imply (1 for
  // isPageTitle, 3 for size="sub", 2 otherwise). Needed when a page's
  // "sub"-styled sections sit directly under that same page's own <h1>
  // with nothing at <h2> in between — e.g. Settings' UI Preferences/
  // Streaming/Account/... sections, which want the smaller "sub" visual
  // treatment but must render <h2> so the outline doesn't skip a level.
  headingLevel?: 1 | 2 | 3;
  className?: string;
}) {
  const sectionDelay = index !== undefined ? staggerDelayMs(index) : 0;
  const isSub = size === "sub";
  const level = headingLevel ?? (isPageTitle ? 1 : isSub ? 3 : 2);
  const Heading = `h${level}` as const;

  return (
    <div className={cn("group", isSub ? "mb-4" : "mb-6", className)}>
      {!isSub && index !== undefined && (
        <div className="mb-3 flex items-center gap-3">
          <div className="section-rule w-10 transition-all duration-medium group-hover:w-16" />
        </div>
      )}
      <div className="flex items-end justify-between gap-4">
        <div className="animate-in" style={{ animationDelay: `${sectionDelay}ms` }}>
          <Heading
            className={cn(
              "font-display tracking-tight transition-all duration-base group-hover:text-primary/90",
              isSub ? "text-heading-sm md:text-heading-md" : "text-heading-lg"
            )}
          >
            {title}
          </Heading>
          {subtitle ? (
            <p
              className={cn(
                "text-muted-foreground transition-colors duration-base group-hover:text-muted-foreground/80",
                isSub ? "mt-1 text-xs" : "mt-1.5 text-sm"
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
