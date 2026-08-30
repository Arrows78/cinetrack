import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Dices } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { MediaGrid } from "@/components/media/primitives/media-grid";
import type { Movie, Series } from "@/types/media";

/** Today Hub's "Watch Tonight" teaser card — a couple of picks plus a link into the full decision flow. */
export function WatchTonightTeaserSection({ items }: { items: Array<Movie | Series> }) {
  const { t } = useTranslation();
  if (!items.length) return null;

  return (
    <div>
      <SectionHeader
        title={t("home.watchTonightTeaser")}
        subtitle={t("home.watchTonightTeaserSubtitle")}
        size="sub"
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/watch-tonight">
              <Dices className="mr-2 size-4" />
              {t("home.watchTonightTeaserCta")}
            </Link>
          </Button>
        }
      />
      <MediaGrid items={items} />
    </div>
  );
}
