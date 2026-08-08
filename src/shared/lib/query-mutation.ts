import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";

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
  invalidateKeys: InvalidateKeys<TData, TVariables>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: async (data, variables) => {
      const keys = typeof invalidateKeys === "function" ? invalidateKeys(data, variables) : invalidateKeys;
      await Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: key })));
    },
  });
}
