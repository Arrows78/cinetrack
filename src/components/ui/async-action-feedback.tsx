import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

interface AsyncActionFeedbackProps {
  tone?: "plain" | "neutral" | "success" | "error";
  className?: string;
  children: ReactNode;
}

const toneClassName: Record<NonNullable<AsyncActionFeedbackProps["tone"]>, string> = {
  plain: "text-sm text-muted-foreground",
  neutral: "rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm",
  success: "rounded-2xl border border-success/30 bg-success/5 px-4 py-3 text-sm",
  error: "rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm",
};

/**
 * A post-action result message (e.g. "Backup exported." / "Import failed")
 * shown after a button-triggered async action. Announced to assistive tech
 * as soon as it appears — role="alert" (implicitly assertive) for errors,
 * a polite status region otherwise — since it reports something that just
 * happened off-screen from the triggering button.
 */
export function AsyncActionFeedback({ tone = "neutral", className, children }: AsyncActionFeedbackProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? undefined : "polite"}
      className={cn(toneClassName[tone], className)}
    >
      {children}
    </div>
  );
}
