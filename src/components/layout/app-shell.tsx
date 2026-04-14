import { Menu } from 'lucide-react'
import { Outlet } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { ThemeController } from '@/components/layout/theme-controller'
import { useUiStore } from '@/store/ui-store'

export function AppShell() {
  const { mobileNavOpen, setMobileNavOpen } = useUiStore()

  return (
    <div className="min-h-screen text-foreground">
      <ThemeController />
      <div className="mx-auto grid min-h-screen w-full max-w-[1700px] grid-cols-1 gap-6 p-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:p-6">
        <aside className="surface hidden min-h-[calc(100vh-3rem)] rounded-[32px] p-5 lg:block">
          <SidebarNav />
        </aside>

        <div className="min-w-0">
          <header className="surface sticky top-4 z-30 mb-6 flex items-center justify-between rounded-[28px] px-4 py-3 lg:px-5">
            <div className="flex items-center gap-3">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
                </SheetContent>
              </Sheet>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
                  Premium tracker
                </p>
                <h1 className="text-lg font-semibold">Ton cockpit films & séries</h1>
              </div>
            </div>
            <ThemeToggle />
          </header>

          <main className="pb-10">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
