import { useTranslation } from 'react-i18next'
import { Link, useRouterState } from '@tanstack/react-router'
import { PanelLeftClose, PanelLeft, ChevronRight, Moon, Sun } from 'lucide-react'
import {
  categoryOrder,
  useNavigationItems,
  type NavigationCategory,
} from '@/shared/constants/navigation'
import { cn } from '@/shared/lib/cn'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { usePreferences } from '@/hooks/use-local-media'

interface SidebarNavProps {
  collapsed: boolean
  onToggleCollapse: () => void
}

const themeOptions = [
  { value: 'dark' as const, icon: Moon },
  { value: 'light' as const, icon: Sun },
]

export function SidebarNav({ collapsed, onToggleCollapse }: SidebarNavProps) {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const navigationItems = useNavigationItems()
  const { data: preferences, updatePreference } = usePreferences()
  const activeTheme = preferences?.theme ?? 'dark'

  const groupedItems = categoryOrder.reduce<Record<NavigationCategory, typeof navigationItems>>(
    (acc, category) => {
      acc[category] = navigationItems.filter((item) => item.category === category)
      return acc
    },
    {} as Record<NavigationCategory, typeof navigationItems>
  )

  const getInitials = (name: string | null): string => {
    if (!name) return 'U'
    const parts = name.trim().split(' ')
    if (parts.length === 1) return parts[0][0].toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  return (
    <div className={cn('flex h-full flex-col', collapsed ? 'px-2' : 'px-4')}>
      <div className={cn('mb-4 flex items-center gap-3', collapsed && 'justify-center')}>
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-glow',
            collapsed ? 'h-10 w-10' : 'h-11 w-11'
          )}
        >
          <span className={cn('font-black', collapsed ? 'text-base' : 'text-lg')}>C</span>
        </div>
        {!collapsed && (
          <div className="flex flex-1 items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-muted-foreground">
                {t('sidebar.brand.tagline')}
              </p>
              <p className="text-xl font-bold">{t('sidebar.brand.name')}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className="h-8 w-8 hidden bg-white/5 lg:flex items-center justify-center"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {collapsed && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          className="mb-4 w-full justify-start gap-2 rounded-xl bg-white/5 text-foreground hover:bg-white/10 hidden lg:flex"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      )}

      <div className="flex-1 space-y-1 overflow-y-auto">
        {categoryOrder.map((category) => {
          const items = groupedItems[category]
          if (!items?.length) return null

          return (
            <div key={category}>
              {!collapsed && (
                <p className="mb-2 px-3 pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t(`sidebar.categories.${category}`)}
                </p>
              )}
              <nav className="space-y-1">
                {items.map((item) => {
                  const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`)
                  const Icon = item.icon

                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all',
                        isActive
                          ? 'bg-primary/15 text-primary shadow-glow'
                          : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                        collapsed && 'justify-center px-2'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0 transition-transform group-hover:scale-110',
                          isActive && 'text-primary'
                        )}
                      />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  )
                })}
              </nav>
            </div>
          )
        })}
      </div>

      <div className="space-y-3 pt-4">
        <Separator />
        {!collapsed && (
          <div>
            <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t('sidebar.theme')}
            </p>
            <ThemeToggle />
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center gap-1 pb-2">
            {themeOptions.map((option) => {
              const Icon = option.icon
              const isActive = activeTheme === option.value
              return (
                <Button
                  key={option.value}
                  variant="ghost"
                  size="icon"
                  className={cn('h-8 w-8', isActive && 'bg-primary/15 text-primary shadow-glow')}
                  onClick={() => updatePreference({ key: 'theme', value: option.value })}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              )
            })}
          </div>
        )}
        <div
          className={cn(
            'flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-2',
            collapsed && 'justify-center p-2'
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
            {getInitials(null)}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{t('sidebar.user')}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t('settings.title').toLowerCase()}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
