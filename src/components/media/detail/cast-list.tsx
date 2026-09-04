import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { buildTmdbImageUrl, placeholderUrl } from "@/shared/utils/format";
import type { CastMember } from "@/types/media";

export function CastList({ cast }: { cast: CastMember[] }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {cast.map((member) => (
        <Card key={member.id} className="flex items-center gap-3 rounded-3xl p-3">
          <img
            src={buildTmdbImageUrl(member.profilePath, "w185") ?? placeholderUrl(200, 300, "Cast")}
            alt=""
            className="h-16 w-16 rounded-2xl object-cover"
          />
          <div className="min-w-0">
            <p className="truncate font-medium">{member.name}</p>
            <Badge variant="outline" className="mt-1 max-w-full truncate">
              {member.character ?? t("media.casting")}
            </Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}
