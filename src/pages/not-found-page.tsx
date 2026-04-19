import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <EmptyState
      icon={TriangleAlert}
      title={t("pages.notFound")}
      description={t("pages.notFoundDesc")}
      action={
        <Button asChild>
          <Link to="/">{t("pages.backToHome")}</Link>
        </Button>
      }
    />
  );
}
