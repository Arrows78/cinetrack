import type * as React from "react";
import { cn } from "@/shared/lib/cn";

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
  return (
    <div className={cn("mb-6", className)}>
      {index !== undefined && (
        <div className="mb-3 flex items-center gap-3">
          <span className="shrink-0 text-[10px] font-semibold tracking-[0.3em] text-primary/50 uppercase">
            {String(index).padStart(2, "0")}
          </span>
          <div className="section-rule" />
        </div>
      )}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold leading-tight tracking-tight md:text-[28px]">{title}</h2>
          {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </div>
    </div>
  );
}
