import type * as React from "react";
import { cn } from "@/shared/lib/cn";
import { staggerDelayMs } from "@/shared/utils/animation";

export function SectionHeader({
  title,
  subtitle,
  action,
  index,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  index?: number;
  className?: string;
}) {
  const sectionDelay = index !== undefined ? staggerDelayMs(index) : 0;

  return (
    <div className={cn("group mb-6", className)}>
      {index !== undefined && (
        <div className="mb-3 flex items-center gap-3">
          <div className="section-rule w-10 transition-all duration-medium group-hover:w-16" />
        </div>
      )}
      <div className="flex items-end justify-between gap-4">
        <div className="animate-in" style={{ animationDelay: `${sectionDelay}ms` }}>
          <h2 className="font-display text-2xl font-bold leading-tight tracking-tight transition-all duration-base md:text-[28px] group-hover:text-primary/90">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1.5 text-sm text-muted-foreground transition-colors duration-base group-hover:text-muted-foreground/80">
              {subtitle}
            </p>
          ) : null}
        </div>
        {action}
      </div>
    </div>
  );
}
