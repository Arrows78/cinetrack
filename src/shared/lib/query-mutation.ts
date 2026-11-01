import { useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";

/**
 * Invalidates `keys` after a local write, first cancelling any read of them
 * still in flight. `invalidateQueries` alone doesn't stop a running fetch of a
 * query nothing is currently rendering (the home page's watch-next cards
 * still resolving after you left it, for instance): that read finishes after
 * the write, stores what it read *before* it, and clears the invalidated
 * flag — so the stale answer then counts as fresh for its whole staleTime.
 * Cancelling reverts such a read to its previous state, and the invalidation
 * then marks it stale for real (refetching it at once if it's on screen).
 */
export async function invalidateAfterWrite(queryClient: QueryClient, keys: QueryKey[]): Promise<void> {
  await Promise.all(keys.map((queryKey) => queryClient.cancelQueries({ queryKey })));
  await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

type InvalidateKeys<TData, TVariables> = QueryKey[] | ((data: TData, variables: TVariables) => QueryKey[]);

/**
 * Wraps useMutation with the "invalidate these query keys on success"
 * pattern repeated across most local-data hooks (see src/features/*\/use-*.ts).
 * `invalidateKeys` is either a static list, or a function deriving the list
 * from the mutation's result/variables (e.g. a series id only known once
 * the call resolves).
 *
 * Not a fit for mutations that also call setQueryData or branch on which
 * variable changed (useLibraryItem, useAvailabilityAlert, usePreferences) —
 * those stay as plain useMutation rather than bending this helper to cover
 * every shape.
 */
export function useInvalidatingMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  invalidateKeys: InvalidateKeys<TData, TVariables>,
  // Passed straight through as this mutation's `meta` — see query-client.ts's
  // MutationCache.onError for what suppressErrorToast does.
  options?: { suppressErrorToast?: boolean }
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    meta: options?.suppressErrorToast ? { suppressErrorToast: true } : undefined,
    onSuccess: async (data, variables) => {
      const keys = typeof invalidateKeys === "function" ? invalidateKeys(data, variables) : invalidateKeys;
      await invalidateAfterWrite(queryClient, keys);
    },
  });
}
