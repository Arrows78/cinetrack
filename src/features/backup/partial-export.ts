import type { CustomListItem, EpisodeProgress, MediaType } from "@/types/media";

// Deliberately a distinct, narrower shape from CineTrackBackup/
// portableDataSchema (portable-data-schema.ts) — these two payloads are
// export-only and never round-trip through portableData.import(), so
// claiming the full-backup format here would be misleading about what a
// restore can actually do with the file.

export interface SeriesExportPayload {
  kind: "series-export";
  exportedAt: string;
  series: {
    id: number;
    title: string;
    posterPath: string | null;
  };
  // profileId is meaningless outside the install that produced it (see
  // userProfileSchema's own note on hasPin for the same reasoning applied
  // to a different per-device field) — stripped rather than exported.
  episodeProgress: Array<Omit<EpisodeProgress, "profileId">>;
}

export interface ListExportPayload {
  kind: "list-export";
  exportedAt: string;
  list: {
    name: string;
    description: string | null;
  };
  items: Array<{
    mediaId: number;
    mediaType: MediaType;
    title: string;
    posterPath: string | null;
    position: number;
  }>;
}

function downloadJson(fileName: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

// Colons/dots swapped for dashes, matching maintenance-service.ts's own
// timestamped filenames — Windows rejects `:` in filenames.
const timestampForFileName = (exportedAt: string) => exportedAt.replace(/[:.]/g, "-");

export const partialExport = {
  exportSeries(series: { id: number; title: string; posterPath: string | null }, episodeProgress: EpisodeProgress[]) {
    const exportedAt = new Date().toISOString();
    const payload: SeriesExportPayload = {
      kind: "series-export",
      exportedAt,
      series,
      episodeProgress: episodeProgress
        .filter((progress) => progress.seriesId === series.id)
        .map(
          ({
            id,
            seriesId,
            episodeId,
            seasonNumber,
            episodeNumber,
            watched,
            watchedAt,
            createdAt,
            updatedAt,
            rating,
          }) => ({
            id,
            seriesId,
            episodeId,
            seasonNumber,
            episodeNumber,
            watched,
            watchedAt,
            createdAt,
            updatedAt,
            rating,
          })
        ),
    };
    downloadJson(`cinetrack-series-${series.id}-${timestampForFileName(exportedAt)}.json`, payload);
  },

  exportList(list: { id: string; name: string; description: string | null }, items: CustomListItem[]) {
    const exportedAt = new Date().toISOString();
    const payload: ListExportPayload = {
      kind: "list-export",
      exportedAt,
      list: { name: list.name, description: list.description },
      items: items
        .filter((item) => item.listId === list.id)
        .map(({ mediaId, mediaType, title, posterPath, position }) => ({
          mediaId,
          mediaType,
          title,
          posterPath,
          position,
        })),
    };
    downloadJson(
      `cinetrack-list-${list.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${timestampForFileName(exportedAt)}.json`,
      payload
    );
  },
};
