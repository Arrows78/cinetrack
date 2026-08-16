import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import type { ProgressBarTone } from "@/shared/utils/series-status";

const TONE_FILL: Record<ProgressBarTone, string> = {
  inProgress: "hsl(var(--primary))",
  caughtUp: "hsl(var(--warning))",
  finished: "hsl(var(--success))",
};

export function ProgressBar({
  value,
  label,
  ariaLabel,
  showPercent = false,
  size = "default",
  className,
  tone,
}: {
  value: number;
  label?: string;
  /** Accessible name when `label` isn't rendered visibly at this call site (most aren't). Falls back to a generic "N% watched" if neither is given. */
  ariaLabel?: string;
  showPercent?: boolean;
  size?: "sm" | "default";
  className?: string;
  /** Solid semantic color instead of the default primary→accent-on-complete gradient — see progressBarTone(). Omit to keep the default look. */
  tone?: ProgressBarTone;
}) {
  const { t } = useTranslation();
  const clampedValue = Math.min(100, Math.max(0, value));
  const isComplete = clampedValue >= 100;

  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || showPercent) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-xs text-muted-foreground">{label}</span>}
          {showPercent && (
            <span className={cn("text-xs font-semibold", isComplete ? "text-primary" : "text-muted-foreground")}>
              {clampedValue}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? label ?? t("media.progressLabel", { percent: clampedValue })}
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-foreground/[0.08]",
          size === "sm" ? "h-1" : "h-1.5"
        )}
      >
        <div
          className="h-full rounded-full transition-all duration-slower ease-out"
          style={{
            width: `${clampedValue}%`,
            background: tone
              ? TONE_FILL[tone]
              : isComplete
                ? "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))"
                : "linear-gradient(90deg, hsl(var(--primary)/0.9), hsl(var(--primary)))",
          }}
        />
      </div>
    </div>
  );
}
