import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/hooks/use-local-media';
import type { UserPreferences } from '@/types/media';
import { cn } from '@/shared/lib/cn';

const themeOptions: Array<{ value: UserPreferences['theme']; label: string; icon: typeof Moon }> = [
  { value: 'dark', label: 'Sombre', icon: Moon },
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'system', label: 'Système', icon: Monitor },
];

export function ThemeToggle() {
  const { data: preferences, updatePreference, isSaving } = usePreferences();

  return (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-card/70 p-1">
      {themeOptions.map((option) => {
        const Icon = option.icon;
        const active = preferences?.theme === option.value;
        return (
          <Button
            key={option.value}
            variant="ghost"
            size="sm"
            disabled={isSaving}
            className={cn('rounded-full px-3', active && 'bg-primary/15 text-primary')}
            onClick={() => updatePreference({ key: 'theme', value: option.value })}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden md:inline">{option.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
