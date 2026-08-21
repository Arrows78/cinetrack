import { useTranslation } from "react-i18next";
import { Link, useRouterState } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { useNavigationItems, type NavigationItem } from "@/shared/constants/navigation";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { useUiStore } from "@/store/ui-store";

// The app's daily loop — check the personalized feed, decide what to watch
// tonight, search for something new, or check tracked progress. Everything
// else (Series/Movies/People/Tracking/Stats/Activity/Settings) lives behind
// "More" instead, exactly like the sidebar already orders it.
const PRIMARY_TAB_PATHS = ["/", "/search", "/watch-tonight", "/library"];

function isItemActive(item: NavigationItem, pathname: string): boolean {
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function TabLink({ item, isActive }: { item: NavigationItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[0.6875rem] font-medium transition-colors",
        isActive ? "text-primary" : "text-muted-foreground"
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{item.label}</span>
    </Link>
  );
}

// The bottom-tab-bar counterpart to the desktop sidebar (see app-shell.tsx's
// lg: split) — fixed at the bottom, lg:hidden, so it never renders once the
// window is wide enough for the sidebar. "More" opens the exact same
// SidebarNav the desktop sidebar uses, in a bottom sheet, so nothing becomes
// unreachable — it's just deprioritized behind one extra tap.
export function MobileTabBar() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigationItems = useNavigationItems();
  const { moreSheetOpen, setMoreSheetOpen } = useUiStore();

  const primaryItems = PRIMARY_TAB_PATHS.map((path) => navigationItems.find((item) => item.to === path)).filter(
    (item): item is NavigationItem => Boolean(item)
  );
  const moreActive = !primaryItems.some((item) => isItemActive(item, pathname));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-sticky flex items-stretch gap-1 border-t border-border bg-background/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
      aria-label={t("sidebar.brand.name")}
    >
      {primaryItems.map((item) => (
        <TabLink key={item.to} item={item} isActive={isItemActive(item, pathname)} />
      ))}

      <Sheet open={moreSheetOpen} onOpenChange={setMoreSheetOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-haspopup="true"
            aria-expanded={moreSheetOpen}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[0.6875rem] font-medium transition-colors",
              moreActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>{t("common.more")}</span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" size="xl" closeLabel={t("common.close")}>
          <SheetTitle className="sr-only">{t("sidebar.brand.name")}</SheetTitle>
          <SheetDescription className="sr-only">{t("sidebar.brand.tagline")}</SheetDescription>
          <SidebarNav collapsed={false} onToggleCollapse={() => {}} onNavigate={() => setMoreSheetOpen(false)} />
        </SheetContent>
      </Sheet>
    </nav>
  );
}
