import { keepPreviousData, useQuery } from "@tanstack/react-query";
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
    // Keeps last year's summary on screen while a newly-selected year loads,
    // instead of the whole panel flashing to a loading state on every click
    // of the year switcher.
    placeholderData: keepPreviousData,
  });
}
export function useWatchForecast() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: [...queryKeys.local.stats(profileId), "forecast"],
    queryFn: () => statsRepository.getForecast(),
  });
}
export function useYearlyActivity() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: [...queryKeys.local.stats(profileId), "yearlyActivity"],
    queryFn: () => statsRepository.getYearlyActivity(),
  });
}
export function useMonthlyRecap(month: string) {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: [...queryKeys.local.stats(profileId), "monthlyRecap", month],
    queryFn: () => statsRepository.getMonthlyRecap(month),
    // Keeps the previous month's recap on screen while a newly-selected
    // month loads, same as useWrapped's year switcher above.
    placeholderData: keepPreviousData,
  });
}
export function useRewatchStats() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: [...queryKeys.local.stats(profileId), "rewatchStats"],
    queryFn: () => statsRepository.getRewatchStats(),
  });
}
export function useRatingDistribution() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: [...queryKeys.local.stats(profileId), "ratingDistribution"],
    queryFn: () => statsRepository.getRatingDistribution(),
  });
}
export function useWatchMilestones() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: [...queryKeys.local.stats(profileId), "milestones"],
    queryFn: () => statsRepository.getWatchMilestones(),
  });
}
// `enabled` gates both the fetch and the cache entry on the opt-in
// preference (see UserPreferences.onThisDayEnabled) — a disabled toggle
// means this never hits the database at all, not just that the Home page
// declines to render what it got back. The query key includes today's date
// so a session left open across midnight refetches instead of serving a
// stale "on this day" for yesterday.
export function useOnThisDay(enabled: boolean) {
  const profileId = useActiveProfileId();
  const today = new Date().toISOString();
  return useQuery({
    queryKey: [...queryKeys.local.stats(profileId), "onThisDay", today.slice(0, 10)],
    queryFn: () => statsRepository.getOnThisDayEvents(today),
    enabled,
  });
}
