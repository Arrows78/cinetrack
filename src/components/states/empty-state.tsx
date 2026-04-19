import type * as React from "react";
import { cn } from "@/shared/lib/cn";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ElementType;
  className?: string;
}

export function EmptyState({ title, description, action, icon: Icon, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-20 text-center", className)}>
      {Icon && (
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-black/[0.04] dark:bg-white/[0.04] text-muted-foreground/60">
          <Icon className="h-7 w-7" />
        </div>
      )}
      <p className="font-display text-2xl font-bold tracking-tight">{title}</p>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action ? <div className="mt-8 flex justify-center">{action}</div> : null}
    </div>
  );
}
