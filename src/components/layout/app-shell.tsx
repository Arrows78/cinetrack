import { useTranslation } from "react-i18next";
import { Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { cn } from "@/shared/lib/cn";
import { Menu, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { useUiStore } from "@/store/ui-store";
import { usePreferences } from "@/hooks/use-local-media";

export function AppShell() {
  const { t } = useTranslation();
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const { mobileNavOpen, setMobileNavOpen } = useUiStore();
  const { data: preferences, updatePreference } = usePreferences();

  const canGoBack = location.pathname !== "/";
  const sidebarCollapsed = preferences?.sidebarCollapsed ?? false;

  const handleToggleSidebar = async () => {
    await updatePreference({ key: "sidebarCollapsed", value: !sidebarCollapsed });
  };

  const handleGoBack = () => router.history.back();

  return (
    <div className="min-h-screen text-foreground">
      <div
        className={cn(
          "mx-auto grid min-h-screen w-full max-w-[1700px] grid-cols-1 gap-6 p-4 lg:p-6",
          sidebarCollapsed ? "lg:grid-cols-[80px_minmax(0,1fr)]" : "lg:grid-cols-[280px_minmax(0,1fr)]"
        )}
      >
        <aside className="surface hidden h-[100dvh] sticky top-0 overflow-hidden rounded-[32px] p-3 lg:block">
          <SidebarNav collapsed={sidebarCollapsed} onToggleCollapse={handleToggleSidebar} />
        </aside>

        <div className="min-w-0">
          {/* Mobile header */}
          <header className="surface sticky top-4 z-30 mb-6 flex items-center justify-between rounded-[28px] px-3 py-2.5 lg:hidden">
            <div className="flex items-center gap-2">
              {canGoBack ? (
                <Button variant="ghost" size="icon" onClick={handleGoBack} className="-ml-1 h-9 w-9">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              ) : (
                <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="-ml-1 h-9 w-9">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SidebarNav collapsed={false} onToggleCollapse={() => {}} />
                  </SheetContent>
                </Sheet>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                  {t("sidebar.brand.tagline")}
                </p>
                <h1 className="text-base font-semibold">{t("sidebar.brand.name")}</h1>
              </div>
            </div>
          </header>

          {/* Desktop back button */}
          {canGoBack && (
            <button
              onClick={handleGoBack}
              className="group mb-4 hidden items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-card hover:text-foreground lg:flex"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              <span>Back</span>
            </button>
          )}

          <main className="pb-10">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
