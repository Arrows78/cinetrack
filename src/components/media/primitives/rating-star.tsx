import type { ReactNode } from "react";
import { formatRating } from "@/shared/utils/format";

/**
 * Shared star+number atom for a rating display — six call sites used to
 * hand-write "★" plus formatRating() with small, undocumented drifts in
 * whether the number shared the star's color. Renders no wrapping element:
 * the caller keeps its own container (chip, Badge, plain span, ...) and its
 * own aria-label/layout classes, exactly as before.
 */
export function RatingStar({
  rating,
  suffix,
  starClassName = "text-rating",
  numberClassName,
}: {
  rating?: number | null;
  /** Reviews' "/10" — appended right after the formatted number. */
  suffix?: string;
  starClassName?: string;
  numberClassName?: string;
}): ReactNode {
  return (
    <>
      <span className={starClassName} aria-hidden="true">
        ★
      </span>
      <span className={numberClassName}>
        {formatRating(rating)}
        {suffix}
      </span>
    </>
  );
}
