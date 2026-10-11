import { usePreferences } from "@/features/preferences/use-preferences";
import { defaultPreferences } from "@/shared/constants/preferences-schema";

/**
 * The "Spoiler protection" setting. While preferences are still loading it
 * answers with the stored default (on), not "off": the first paint must not
 * show a title or synopsis that the loaded setting would have hidden.
 */
export function useSpoilerProtection(): boolean {
  const { data } = usePreferences();
  return data?.spoilerProtection ?? defaultPreferences.spoilerProtection;
}
