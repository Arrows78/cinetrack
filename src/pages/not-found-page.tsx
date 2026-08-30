import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <>
      {/* EmptyState's own title is a <p>, not a heading — reused across
          many section-level empty states elsewhere (search results,
          library filters, ...) where it deliberately isn't the page's h1.
          Here it IS the whole page, so it needs its own. */}
      <h1 className="sr-only">{t("pages.notFound")}</h1>
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
    </>
  );
}
