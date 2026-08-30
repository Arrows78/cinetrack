import { useTranslation } from "react-i18next";
import { Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/shared/lib/cn";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { CommandPalette } from "@/components/desktop/command-palette";
import { ProfileSwitcher } from "@/components/layout/profile-switcher";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { usePreferences } from "@/features/preferences/use-preferences";

// `router.history.back()` has nowhere sensible to go when this window has no
// prior in-app navigation (a deep link, or a reload) — this maps a detail
// route to its logical parent list for that case.
function fallbackRouteFor(pathname: string): string {
  const seasonMatch = /^(\/series\/[^/]+)\/season\//.exec(pathname);
  if (seasonMatch) return seasonMatch[1]!;
  if (pathname.startsWith("/series/")) return "/series";
  if (pathname.startsWith("/movies/")) return "/movies";
  if (pathname.startsWith("/people/")) return "/people";
  return "/";
}

export function AppShell() {
  const { t } = useTranslation();
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const { data: preferences, updatePreference } = usePreferences();

  const canGoBack = location.pathname !== "/";
  const sidebarCollapsed = preferences?.sidebarCollapsed ?? false;

  const handleToggleSidebar = async () => {
    await updatePreference({ key: "sidebarCollapsed", value: !sidebarCollapsed });
  };

  const handleGoBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      void router.navigate({ to: fallbackRouteFor(location.pathname) });
    }
  };

  return (
    <div className="min-h-dvh text-foreground">
      {/* First focusable element in the document — a sighted mouse user
          never sees it (sr-only until focused), but a keyboard user
          tabbing in otherwise has to step through the entire sidebar/back
          button on every single page before reaching the content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-panel focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
      >
        {t("common.skipToContent")}
      </a>
      <div
        className={cn(
          "mx-auto grid w-full max-w-[106.25rem] grid-cols-1 gap-6 p-4 lg:items-start lg:p-6",
          sidebarCollapsed ? "lg:grid-cols-[5rem_minmax(0,1fr)]" : "lg:grid-cols-[17.5rem_minmax(0,1fr)]"
        )}
      >
        <aside className="surface hidden max-h-[100dvh] self-start sticky top-0 overflow-hidden rounded-shell p-3 lg:block">
          <SidebarNav collapsed={sidebarCollapsed} onToggleCollapse={() => void handleToggleSidebar()} />
        </aside>

        <div className="min-w-0">
          {/*
            Mobile/tablet header — live below "lg" (1024px) in the shipped
            app now that src-tauri/tauri.conf.json's minWidth is 360, not
            just in pnpm dev's browser-preview surface. Primary navigation
            lives in MobileTabBar (fixed at the bottom, rendered below);
            this header is just the back button (when there's somewhere to
            go back to) and the brand — a persistent brand mark, not page
            content, so it's a <p> here exactly like the desktop sidebar's
            own brand name below (SidebarNav): the page's own heading (see
            each page component) is the document's real <h1>.
          */}
          <header className="surface sticky top-[calc(1rem+env(safe-area-inset-top))] z-sticky mb-6 flex items-center justify-between rounded-panel px-3 py-2.5 lg:hidden">
            <div className="flex items-center gap-2">
              {canGoBack && (
                <IconTooltip label={t("common.back")}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleGoBack}
                    className="-ml-1 h-9 w-9"
                    aria-label={t("common.back")}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </IconTooltip>
              )}
              <div>
                <p className="text-overline uppercase text-muted-foreground">{t("sidebar.brand.tagline")}</p>
                <p className="text-base font-semibold">{t("sidebar.brand.name")}</p>
              </div>
            </div>
            <ProfileSwitcher collapsed />
          </header>

          {/* Desktop back button */}
          {canGoBack && (
            <button
              type="button"
              onClick={handleGoBack}
              className="group mb-4 hidden items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-card hover:text-foreground lg:flex"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              <span>{t("common.back")}</span>
            </button>
          )}

          {/* pb-24 clears the fixed MobileTabBar (plus its own safe-area
              inset) below lg; above it the tab bar doesn't render, so pb-10
              matches the desktop back-button/content rhythm instead. */}
          <main id="main-content" className="pb-24 lg:pb-10">
            {/* No `mode="wait"`: it holds the incoming page unmounted until
                the outgoing one's exit animation resolves, and a lazy-loaded
                route component (most pages here are `lazyRouteComponent`) can
                leave that exit promise unresolved on a fast series-to-series
                navigation — the new page then never mounts, leaving the
                content area permanently blank while the shell around it
                (sidebar, back button) stays visible, since neither is inside
                this AnimatePresence. Default mode lets the two cross-fade
                instead of strictly sequencing them — barely visible at 180ms
                — trading a fixable near-invisible overlap for an unfixable
                stuck page. */}
            <AnimatePresence>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <MobileTabBar />
      <CommandPalette />
    </div>
  );
}
