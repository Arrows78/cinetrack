/**
 * The providers an availability alert cares about, out of those currently
 * offering the title: the ones the alert itself selected, or — when it
 * selected none — the profile's own streaming services, or — when it has
 * neither — any provider at all.
 *
 * The one rule behind both "should this alert notify" (availability-monitor)
 * and "is this alert available now" (the alert list and the tracking feed),
 * so the three can never disagree on what an alert is waiting for.
 */
export function matchAlertProviderIds(
  alertProviderIds: readonly number[],
  preferredProviderIds: readonly number[],
  currentProviderIds: readonly number[]
): number[] {
  const relevant = alertProviderIds.length ? alertProviderIds : preferredProviderIds;
  return relevant.length ? currentProviderIds.filter((id) => relevant.includes(id)) : [...currentProviderIds];
}
