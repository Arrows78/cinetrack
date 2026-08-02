import { useTranslation } from "react-i18next";
import { ExternalLink, PlayCircle } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { useVideos } from "@/features/media/use-discovery";
import type { MediaType } from "@/types/media";
export function TrailerPanel({ mediaType, mediaId }: { mediaType: MediaType; mediaId: number }) {
  const { t } = useTranslation();
  const query = useVideos(mediaType, mediaId);
  const video = query.data?.find((item) => item.type === "Trailer") ?? query.data?.[0];
  if (!video) return null;
  return (
    <Panel>
      <div className="flex items-center gap-2">
        <PlayCircle className="size-5 text-primary" />
        <h2 className="font-semibold">{t("media.trailer")}</h2>
      </div>
      <div className="mt-4 aspect-video overflow-hidden rounded-2xl bg-black">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${video.key}`}
          title={video.name}
          allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
      <a
        className="mt-3 inline-flex items-center gap-1 text-sm text-primary"
        href={`https://www.youtube.com/watch?v=${video.key}`}
        target="_blank"
        rel="noreferrer"
      >
        {t("media.openOnYoutube")} <ExternalLink className="size-3" />
      </a>
    </Panel>
  );
}
