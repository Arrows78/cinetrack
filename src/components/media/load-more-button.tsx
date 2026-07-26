import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface LoadMoreButtonProps {
  hasNextPage?: boolean;
  isFetchingNextPage: boolean;
  onClick: () => void;
}

export function LoadMoreButton({ hasNextPage, isFetchingNextPage, onClick }: LoadMoreButtonProps) {
  const { t } = useTranslation();
  if (!hasNextPage) return null;
  return (
    <div className="flex justify-center pt-8">
      <Button type="button" variant="outline" onClick={onClick} disabled={isFetchingNextPage}>
        {isFetchingNextPage ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
        {isFetchingNextPage ? t("media.loading") : t("media.loadMore")}
      </Button>
    </div>
  );
}
