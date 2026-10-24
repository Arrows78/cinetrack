import type * as React from "react";
import { cn } from "@/shared/lib/cn";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ElementType;
  className?: string;
  // When this state replaces a whole page whose own title comes from the
  // data that failed to load (a detail page), its title is the page's <h1>.
  isPageTitle?: boolean;
}

export function EmptyState({ title, description, action, icon: Icon, className, isPageTitle }: EmptyStateProps) {
  const Title = isPageTitle ? "h1" : "p";
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-20 text-center", className)}>
      {Icon && (
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-foreground/[0.04] text-muted-foreground/60">
          <Icon className="h-7 w-7" />
        </div>
      )}
      <Title className="font-display text-heading-lg font-bold tracking-tight">{title}</Title>
      <p className="mx-auto mt-3 max-w-sm text-body-sm leading-relaxed text-muted-foreground">{description}</p>
      {action ? <div className="mt-8 flex justify-center">{action}</div> : null}
    </div>
  );
}
