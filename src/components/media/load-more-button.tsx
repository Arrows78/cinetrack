import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface LoadMoreButtonProps {
  hasNextPage?: boolean;
  isFetchingNextPage: boolean;
  onClick: () => void;
}

/**
 * Infinite-scroll sentinel: fetches the next page automatically when the
 * button approaches the viewport. The visible button stays as an accessible,
 * keyboard-friendly fallback (and for environments without
 * IntersectionObserver).
 */
export function LoadMoreButton({ hasNextPage, isFetchingNextPage, onClick }: LoadMoreButtonProps) {
  const { t } = useTranslation();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onClickRef = useRef(onClick);

  useLayoutEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!hasNextPage || isFetchingNextPage || !node || typeof IntersectionObserver === "undefined") return;

    // Re-created after each fetch (isFetchingNextPage dependency) so the
    // initial intersection check fires again — otherwise a sentinel that
    // stays in view after a short page load would never re-trigger.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onClickRef.current();
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage]);

  if (!hasNextPage) return null;
  return (
    <div ref={sentinelRef} className="flex justify-center pt-8">
      <Button type="button" variant="outline" onClick={onClick} isLoading={isFetchingNextPage}>
        {isFetchingNextPage ? t("media.loading") : t("media.loadMore")}
      </Button>
    </div>
  );
}
