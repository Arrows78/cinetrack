import { useQuery } from "@tanstack/react-query";
import { mediaRepository } from "@/features/media/media-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import type { MediaType } from "@/types/media";

export function useRecommendations(mediaType: MediaType, mediaId: number) {
  return useQuery({
    queryKey: queryKeys.remote.recommendations(mediaType, mediaId),
    queryFn: () => mediaRepository.getRecommendations(mediaType, mediaId),
    enabled: Number.isFinite(mediaId),
  });
}
export function useVideos(mediaType: MediaType, mediaId: number) {
  return useQuery({
    queryKey: queryKeys.remote.videos(mediaType, mediaId),
    queryFn: () => mediaRepository.getVideos(mediaType, mediaId),
    enabled: Number.isFinite(mediaId),
  });
}
export function useAvailability(mediaType: MediaType, mediaId: number, region: string) {
  return useQuery({
    queryKey: queryKeys.remote.availability(mediaType, mediaId, region),
    queryFn: () => mediaRepository.getWatchAvailability(mediaType, mediaId, region),
    enabled: Number.isFinite(mediaId) && Boolean(region),
    staleTime: 1000 * 60 * 60 * 6,
  });
}
export function usePeopleSearch(query: string) {
  return useQuery({
    queryKey: ["remote", "people", query],
    queryFn: () => mediaRepository.searchPeople(query),
    enabled: query.trim().length >= 2,
  });
}
export function usePerson(personId: number) {
  return useQuery({
    queryKey: queryKeys.remote.person(personId),
    queryFn: () => mediaRepository.getPerson(personId),
    enabled: Number.isFinite(personId),
  });
}
