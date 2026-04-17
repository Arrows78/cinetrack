import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { Menu } from 'lucide-react'
import { Outlet } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { ThemeController } from '@/components/layout/theme-controller'
import { useUiStore } from '@/store/ui-store'
import { usePreferences } from '@/hooks/use-local-media'

export function AppShell() {
  const { t } = useTranslation()
  const { mobileNavOpen, setMobileNavOpen } = useUiStore()
  const { data: preferences, updatePreference } = usePreferences()
  const sidebarCollapsed = preferences?.sidebarCollapsed ?? false

  const handleToggleSidebar = async () => {
    await updatePreference({ key: 'sidebarCollapsed', value: !sidebarCollapsed })
  }

  return (
    <div className="min-h-screen text-foreground">
      <ThemeController />
      <div
        className={cn(
          'mx-auto grid min-h-screen w-full max-w-[1700px] grid-cols-1 gap-6 p-4 lg:p-6',
          sidebarCollapsed
            ? 'lg:grid-cols-[80px_minmax(0,1fr)]'
            : 'lg:grid-cols-[280px_minmax(0,1fr)]'
        )}
      >
        <aside className="surface hidden h-[100dvh] sticky top-0 overflow-hidden rounded-[32px] p-3 lg:block">
          <SidebarNav collapsed={sidebarCollapsed} onToggleCollapse={handleToggleSidebar} />
        </aside>

        <div className="min-w-0">
          <header className="surface sticky top-4 z-30 mb-6 flex items-center justify-between rounded-[28px] px-4 py-3 lg:hidden">
            <div className="flex items-center gap-3">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SidebarNav collapsed={false} onToggleCollapse={() => {}} />
                </SheetContent>
              </Sheet>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
                  {t('sidebar.brand.tagline')}
                </p>
                <h1 className="text-lg font-semibold">{t('sidebar.brand.name')}</h1>
              </div>
            </div>
          </header>

          <main className="pb-10">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
