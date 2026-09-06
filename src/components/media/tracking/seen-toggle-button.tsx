import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, LoaderCircle } from "lucide-react";
import { IconTooltip } from "@/components/ui/tooltip";
import { cn } from "@/shared/lib/cn";

interface SeenToggleButtonProps {
  /** Whether the toggle is currently saving. */
  isSaving: boolean;
  /** Callback when the button is clicked. */
  onToggle: () => void | Promise<void>;
  /** Current seen state — controls the check icon's visual state. */
  seen?: boolean;
  /** Button size variant. */
  size?: "sm" | "md" | "lg";
  /** Structural reason the toggle can't be used right now (e.g. the episode
   * hasn't aired yet) — distinct from `isSaving`'s transient in-flight
   * state, and paired with `disabledLabel` below for why. */
  disabled?: boolean;
  /** Overrides the seen/unseen label while `disabled` is true. */
  disabledLabel?: string;
}

const sizeClasses = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-11 w-11",
} as const;

const iconSizeClasses = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-5 w-5",
} as const;

/**
 * Circular "mark as seen" toggle button used across episode cards,
 * watch-next rows, and list rows. Consolidates the three near-identical
 * inline button implementations that previously lived in separate files.
 */
export function SeenToggleButton({
  isSaving,
  onToggle,
  seen = false,
  size = "md",
  disabled = false,
  disabledLabel,
}: SeenToggleButtonProps) {
  const { t } = useTranslation();
  const [justChecked, setJustChecked] = useState(false);
  const label = disabled && disabledLabel ? disabledLabel : seen ? t("media.markUnseen") : t("media.markSeen");

  const handleClick = async () => {
    setJustChecked(true);
    try {
      await onToggle();
    } finally {
      setJustChecked(false);
    }
  };

  return (
    <IconTooltip label={label}>
      <button
        type="button"
        disabled={isSaving || disabled}
        onClick={() => void handleClick()}
        aria-label={label}
        aria-pressed={seen}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          sizeClasses[size],
          seen
            ? "border-success bg-success text-success-foreground"
            : justChecked
              ? "border-success bg-success text-success-foreground"
              : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
        )}
      >
        {isSaving ? (
          <LoaderCircle className={cn("animate-spin", iconSizeClasses[size])} />
        ) : (
          <Check className={iconSizeClasses[size]} />
        )}
      </button>
    </IconTooltip>
  );
}
