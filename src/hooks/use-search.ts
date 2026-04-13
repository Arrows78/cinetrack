import { useQuery } from '@tanstack/react-query';
import { mediaRepository } from '@/services/repositories/media-repository';
import { queryKeys } from '@/shared/constants/query-keys';

export function useSearch(query: string, scope: 'all' | 'movie' | 'series') {
  return useQuery({
    queryKey: queryKeys.remote.search(query, scope),
    queryFn: () => mediaRepository.search(query, scope),
    enabled: query.trim().length >= 2,
  });
}
