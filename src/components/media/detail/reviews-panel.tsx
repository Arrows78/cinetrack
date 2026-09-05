import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { formatDate, placeholderUrl } from "@/shared/utils/format";
import type { MediaReview } from "@/types/media";

function ReviewCard({ review }: { review: MediaReview }) {
  const { t } = useTranslation();
  return (
    <Panel tone="subtle" className="p-6">
      <div className="flex items-center gap-3">
        <img
          src={review.avatarUrl ?? placeholderUrl(92, 92, review.author)}
          alt=""
          className="size-10 shrink-0 rounded-full object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{review.author}</p>
          <p className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</p>
        </div>
        {review.rating ? (
          <Badge variant="outline" className="shrink-0">
            <span className="text-rating" aria-hidden="true">
              ★
            </span>{" "}
            {review.rating}/10
          </Badge>
        ) : null}
      </div>
      <p className="mt-3 line-clamp-6 text-sm leading-6 text-muted-foreground">{review.content}</p>
      <a
        href={review.url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-sm text-primary"
      >
        {t("media.readFullReview")} <ExternalLink className="size-3" />
      </a>
    </Panel>
  );
}

export function ReviewsPanel({ reviews }: { reviews?: MediaReview[] }) {
  const { t } = useTranslation();
  if (!reviews?.length) return null;
  return (
    <section>
      <SectionHeader title={t("media.reviews")} />
      <div className="grid gap-4 md:grid-cols-2">
        {reviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>
    </section>
  );
}
