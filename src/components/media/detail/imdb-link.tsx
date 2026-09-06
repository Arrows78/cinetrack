import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";

// IMDb ids double as their own URL discriminator: person ids start "nm"
// (/name/…), everything else (movies "tt", TV "tt") is /title/… — shared by
// movie/series/person detail pages instead of duplicating this link markup.
export function ImdbLink({ imdbId }: { imdbId?: string | null }) {
  const { t } = useTranslation();
  if (!imdbId) return null;
  const segment = imdbId.startsWith("nm") ? "name" : "title";
  return (
    <a
      className="inline-flex items-center gap-1 text-body-sm text-primary"
      href={`https://www.imdb.com/${segment}/${imdbId}/`}
      target="_blank"
      rel="noreferrer"
    >
      {t("media.viewOnImdb")} <ExternalLink className="size-3" />
    </a>
  );
}
