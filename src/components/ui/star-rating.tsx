import type { KeyboardEvent } from "react";
import { Star } from "lucide-react";
import { cn } from "@/shared/lib/cn";

const STAR_COUNT = 5;
const POINTS_PER_STAR = 2;
const MAX_VALUE = STAR_COUNT * POINTS_PER_STAR;

function fillPercentFor(starIndex: number, value: number): number {
  const starMin = starIndex * POINTS_PER_STAR;
  if (value <= starMin) return 0;
  if (value >= starMin + POINTS_PER_STAR) return 100;
  return ((value - starMin) / POINTS_PER_STAR) * 100;
}

/**
 * A 5-star, half-star-accurate rating control over an underlying 0-10 scale
 * (a half star = 1 point) — the star/emoji alternative to the plain numeric
 * rating input, for anywhere a user sets their own rating (library items,
 * episodes). Two invisible half-width buttons per star handle pointer
 * clicks; the outer element is a single `role="slider"` stop so keyboard
 * users get one tab stop with arrow-key stepping, rather than five.
 */
export function StarRating({
  value,
  onChange,
  disabled = false,
  ariaLabel,
  noneLabel,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  ariaLabel: string;
  /** Announced as aria-valuetext when nothing is rated yet. */
  noneLabel: string;
}) {
  const clamped = Math.min(MAX_VALUE, Math.max(0, value ?? 0));

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onChange(Math.min(MAX_VALUE, clamped + 1));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onChange(Math.max(0, clamped - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      onChange(0);
    } else if (event.key === "End") {
      event.preventDefault();
      onChange(MAX_VALUE);
    }
  };

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={MAX_VALUE}
      aria-valuenow={clamped}
      aria-valuetext={value ? `${value}/${MAX_VALUE}` : noneLabel}
      aria-disabled={disabled}
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        disabled ? "opacity-50" : "cursor-pointer"
      )}
    >
      {Array.from({ length: STAR_COUNT }, (_, index) => {
        const percent = fillPercentFor(index, clamped);
        const starMin = index * POINTS_PER_STAR;
        const halfValue = starMin + 1;
        const fullValue = starMin + POINTS_PER_STAR;
        return (
          <span key={index} className="relative inline-block size-6">
            <Star className="absolute inset-0 size-6 text-muted-foreground/40" aria-hidden="true" />
            <Star
              className="absolute inset-0 size-6 fill-primary text-primary"
              style={{ clipPath: `inset(0 ${100 - percent}% 0 0)` }}
              aria-hidden="true"
            />
            {disabled ? null : (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-1/2"
                  onClick={() => onChange(clamped === halfValue ? null : halfValue)}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="absolute inset-y-0 right-0 w-1/2"
                  onClick={() => onChange(clamped === fullValue ? null : fullValue)}
                />
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}
