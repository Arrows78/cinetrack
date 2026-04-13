import { Link, useRouterState } from '@tanstack/react-router';
import { navigationItems } from '@/shared/constants/navigation';
import { cn } from '@/shared/lib/cn';
import { Separator } from '@/components/ui/separator';

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-glow">
            <span className="text-lg font-black">C</span>
          </div>
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-muted-foreground">Cinema OS</p>
            <p className="text-xl font-bold">CineTrack</p>
          </div>
        </div>

        <nav className="space-y-1">
          {navigationItems.map((item) => {
            const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary/15 text-primary shadow-glow'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-4">
        <Separator />
        <div className="rounded-3xl border border-white/5 bg-white/5 p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Desktop-first, mobile-ready</p>
          <p className="mt-2 text-sm leading-6">
            Shell Tauri, persistance locale robuste et UI responsive prête pour une future adaptation mobile.
          </p>
        </div>
      </div>
    </div>
  );
}
