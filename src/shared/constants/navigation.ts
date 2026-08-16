import {
  BarChart3,
  CalendarDays,
  Dices,
  Film,
  History,
  House,
  LibraryBig,
  Search,
  Settings,
  Tv,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";

// Categories double as the sidebar's visible section grouping (see
// navigationSections below) — home stands alone as the always-first entry
// point, discover covers TMDB-catalogue browsing, library is the user's own
// tracked content, insights is stats/activity, account is settings-adjacent
// and stays pinned to the bottom of the sidebar.
export type NavigationCategory = "home" | "discover" | "library" | "insights" | "account";
export interface NavigationItem {
  label: string;
  to: string;
  icon: typeof House;
  category: NavigationCategory;
  translationKey: string;
}
export const navigationConfig: NavigationItem[] = [
  { label: "Home", to: "/", icon: House, category: "home", translationKey: "home" },
  { label: "Series", to: "/series", icon: Tv, category: "discover", translationKey: "series" },
  { label: "Movies", to: "/movies", icon: Film, category: "discover", translationKey: "movies" },
  { label: "Search", to: "/search", icon: Search, category: "discover", translationKey: "search" },
  { label: "People", to: "/people", icon: Users, category: "discover", translationKey: "people" },
  { label: "Tonight", to: "/watch-tonight", icon: Dices, category: "discover", translationKey: "watchTonight" },
  { label: "Library", to: "/library", icon: LibraryBig, category: "library", translationKey: "library" },
  { label: "Tracking", to: "/tracking", icon: CalendarDays, category: "library", translationKey: "tracking" },
  { label: "Stats", to: "/stats", icon: BarChart3, category: "insights", translationKey: "stats" },
  { label: "Activity", to: "/history", icon: History, category: "insights", translationKey: "history" },
  { label: "Settings", to: "/settings", icon: Settings, category: "account", translationKey: "settings" },
];

export interface NavigationSection {
  category: NavigationCategory;
  // Omitted for "home": it's a single always-visible entry point, not a
  // labeled group. Every other section gets a visible header in expanded
  // mode (see sidebar-nav.tsx); collapsed mode hides all headers instead.
  labelKey?: string;
}

// Single source of truth for both section order and section labels, so
// sidebar-nav.tsx never hand-duplicates this list.
export const navigationSections: NavigationSection[] = [
  { category: "home" },
  { category: "discover", labelKey: "sidebar.sections.discover" },
  { category: "library", labelKey: "sidebar.sections.library" },
  { category: "insights", labelKey: "sidebar.sections.insights" },
  { category: "account", labelKey: "sidebar.sections.account" },
];
export const useNavigationItems = () => {
  const { t } = useTranslation();
  return navigationConfig.map((item) => ({
    ...item,
    label: t(`nav.${item.translationKey}`, { defaultValue: item.label }),
  })) as readonly NavigationItem[];
};
