import {
  BarChart3,
  CalendarDays,
  Clapperboard,
  Dices,
  Film,
  FolderHeart,
  History,
  House,
  Search,
  Settings,
  Tv,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
export type NavigationCategory = "main" | "settings";
export interface NavigationItem {
  label: string;
  to: string;
  icon: typeof House;
  category: NavigationCategory;
  translationKey: string;
}
export const navigationConfig: NavigationItem[] = [
  { label: "Home", to: "/", icon: House, category: "main", translationKey: "home" },
  { label: "Series", to: "/series", icon: Tv, category: "main", translationKey: "series" },
  { label: "Movies", to: "/movies", icon: Film, category: "main", translationKey: "movies" },
  { label: "Search", to: "/search", icon: Search, category: "main", translationKey: "search" },
  { label: "People", to: "/people", icon: Users, category: "main", translationKey: "people" },
  { label: "Tonight", to: "/watch-tonight", icon: Dices, category: "main", translationKey: "watchTonight" },
  { label: "Watchlist", to: "/watchlist", icon: Clapperboard, category: "main", translationKey: "watchlist" },
  { label: "Collections", to: "/collections", icon: FolderHeart, category: "main", translationKey: "collections" },
  { label: "Calendar", to: "/calendar", icon: CalendarDays, category: "main", translationKey: "calendar" },
  { label: "Stats", to: "/stats", icon: BarChart3, category: "main", translationKey: "stats" },
  { label: "Activity", to: "/history", icon: History, category: "main", translationKey: "history" },
  { label: "Settings", to: "/settings", icon: Settings, category: "settings", translationKey: "settings" },
];
export const categoryOrder: NavigationCategory[] = ["main", "settings"];
export const useNavigationItems = () => {
  const { t } = useTranslation();
  return navigationConfig.map((item) => ({
    ...item,
    label: t(`nav.${item.translationKey}`, { defaultValue: item.label }),
  })) as readonly NavigationItem[];
};
