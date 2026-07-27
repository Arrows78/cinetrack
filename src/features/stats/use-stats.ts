import { useQuery } from "@tanstack/react-query";
import { statsRepository } from "@/features/stats/stats-repository";
import { queryKeys } from "@/shared/constants/query-keys";
export function useStats() { return useQuery({ queryKey: queryKeys.local.stats, queryFn: () => statsRepository.getStats() }); }
export function useWrapped(year = new Date().getFullYear()) { return useQuery({ queryKey: [...queryKeys.local.stats, "wrapped", year], queryFn: () => statsRepository.getYearSummary(year) }); }
