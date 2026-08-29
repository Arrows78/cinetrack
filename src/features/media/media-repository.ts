import { TmdbMediaProvider } from "@/features/media/tmdb-media-provider";

export { TmdbRequestError } from "@/features/media/api/client";

export const mediaRepository = new TmdbMediaProvider();
