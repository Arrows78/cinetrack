import type * as React from "react";
import { cn } from "@/shared/lib/cn";
import { staggerDelayMs } from "@/shared/utils/animation";

export function SectionHeader({
  title,
  subtitle,
  action,
  index,
  size = "default",
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  index?: number;
  // "sub" is for a header nested inside a larger zone (e.g. the home
  // dashboard's "For You" panel grouping several personalized rails under
  // one heading) — smaller type, no eyebrow rule, and an <h3> instead of an
  // <h2> so the zone's own SectionHeader stays the real top-level heading.
  size?: "default" | "sub";
  className?: string;
}) {
  const sectionDelay = index !== undefined ? staggerDelayMs(index) : 0;
  const isSub = size === "sub";
  const Heading = isSub ? "h3" : "h2";

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
              "font-display font-bold leading-tight tracking-tight transition-all duration-base group-hover:text-primary/90",
              isSub ? "text-lg md:text-xl" : "text-2xl md:text-[1.75rem]"
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
