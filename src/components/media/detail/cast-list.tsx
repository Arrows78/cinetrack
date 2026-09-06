import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import type { CastMember } from "@/types/media";
import fallbackPortrait from "@/assets/person-placeholder.svg";

export function CastList({ cast }: { cast: CastMember[] }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {cast.map((member) => (
        <Card key={member.id} className="rounded-card p-3 transition hover:border-primary/50">
          <Link to="/people/$personId" params={{ personId: String(member.id) }} className="flex items-center gap-3">
            <img
              src={buildTmdbImageUrl(member.profilePath, "w185") ?? fallbackPortrait}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-16 w-16 rounded-2xl object-cover"
            />
            <div className="min-w-0">
              <p className="truncate font-medium">{member.name}</p>
              <Badge variant="outline" className="mt-1 max-w-full truncate">
                {member.character ?? t("media.casting")}
              </Badge>
            </div>
          </Link>
        </Card>
      ))}
    </div>
  );
}
