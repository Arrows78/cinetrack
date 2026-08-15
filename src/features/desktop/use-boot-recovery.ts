import { useQuery } from "@tanstack/react-query";
import { bootRecoveryRepository } from "@/features/desktop/boot-recovery-repository";

// Read once per app launch — init_pool decides this at process startup, so
// it can never change during the session and never needs invalidating.
export function useBootRecovery() {
  return useQuery({
    queryKey: ["boot-recovery"],
    queryFn: () => bootRecoveryRepository.get(),
    staleTime: Infinity,
    retry: false,
  });
}
