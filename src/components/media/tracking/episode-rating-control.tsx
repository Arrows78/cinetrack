import { useTranslation } from "react-i18next";
import { IconTooltip } from "@/components/ui/tooltip";
import { cn } from "@/shared/lib/cn";

// Plain 1-5 integer, not a named enum — see EpisodeProgress.rating's own doc
// comment (src-tauri/src/progress/models.rs) for why: a future /10-with-
// half-points scale is then just a different multiplier over the same
// column, not a migration. The emoji are purely decorative — every option
// still carries its own real word as the accessible label (aria-label),
// same "never labeled by an emoji/icon alone" rule the design system
// applies everywhere else.
const RATING_OPTIONS = [
  { value: 1, emoji: "😞" },
  { value: 2, emoji: "😕" },
  { value: 3, emoji: "😐" },
  { value: 4, emoji: "🙂" },
  { value: 5, emoji: "🤩" },
] as const;

export interface EpisodeRatingControlProps {
  rating: number | null;
  onRate: (value: number | null) => void;
  disabled?: boolean;
}

/**
 * Five-option qualitative rating for a single (already-watched) episode —
 * clicking the currently-selected option clears it, same "tap again to
 * undo" convention as SeenToggleButton.
 */
export function EpisodeRatingControl({ rating, onRate, disabled = false }: EpisodeRatingControlProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1" role="group" aria-label={t("episode.rating.label")}>
      {RATING_OPTIONS.map(({ value, emoji }) => {
        const label = t(`episode.rating.${value}`);
        const selected = rating === value;
        return (
          <IconTooltip key={value} label={selected ? `${label} — ${t("episode.rating.clear")}` : label}>
            <button
              type="button"
              disabled={disabled}
              aria-label={label}
              aria-pressed={selected}
              onClick={() => onRate(selected ? null : value)}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full border text-body-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                selected
                  ? "border-primary bg-primary/15 grayscale-0"
                  : "border-border bg-card grayscale hover:grayscale-0"
              )}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          </IconTooltip>
        );
      })}
    </div>
  );
}
