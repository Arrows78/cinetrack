import { useQuery } from "@tanstack/react-query";
import { calendarService } from "@/features/calendar/calendar-service";
import { queryKeys } from "@/shared/constants/query-keys";
export function useCalendar() { return useQuery({ queryKey: queryKeys.local.calendar, queryFn: () => calendarService.build(), staleTime: 1000 * 60 * 30 }); }
