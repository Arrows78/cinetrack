import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { availabilityRepository } from "@/features/availability/availability-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import type { MediaSummary } from "@/types/media";
export function useAvailabilityAlert(media:MediaSummary,region:string,providerIds:number[]){const client=useQueryClient();const query=useQuery({queryKey:[...queryKeys.local.availabilityAlerts,media.mediaType,media.id],queryFn:()=>availabilityRepository.getAlert(media.id,media.mediaType)});const mutation=useMutation({mutationFn:()=>availabilityRepository.toggle(media,region,providerIds),onSuccess:(data)=>{client.setQueryData([...queryKeys.local.availabilityAlerts,media.mediaType,media.id],data);void client.invalidateQueries({queryKey:queryKeys.local.availabilityAlerts});}});return{...query,toggle:mutation.mutateAsync,isSaving:mutation.isPending};}
