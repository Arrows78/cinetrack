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
          <span className="shrink-0 text-[10px] font-semibold tracking-[0.3em] text-primary/50 uppercase transition-all duration-medium group-hover:text-primary/80">
            {String(index).padStart(2, "0")}
          </span>
          <div className="section-rule w-16 transition-all duration-medium group-hover:w-24" />
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
