import { useQuery } from "@tanstack/react-query";
import { calendarService } from "@/features/calendar/calendar-service";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
export function useCalendar() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: queryKeys.local.calendar(profileId),
    queryFn: () => calendarService.build(),
    staleTime: 1000 * 60 * 30,
  });
}
