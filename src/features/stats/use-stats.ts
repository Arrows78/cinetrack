import { useQuery } from "@tanstack/react-query";
import { statsRepository } from "@/features/stats/stats-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
export function useStats() {
  const profileId = useActiveProfileId();
  return useQuery({ queryKey: queryKeys.local.stats(profileId), queryFn: () => statsRepository.getStats() });
}
export function useWrapped(year = new Date().getFullYear()) {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: [...queryKeys.local.stats(profileId), "wrapped", year],
    queryFn: () => statsRepository.getYearSummary(year),
  });
}
export function useWatchForecast() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: [...queryKeys.local.stats(profileId), "forecast"],
    queryFn: () => statsRepository.getForecast(),
  });
}
