import { useEffect } from 'react';
import { usePreferences } from '@/hooks/use-local-media';

export function ThemeController() {
  const { data: preferences } = usePreferences();

  useEffect(() => {
    const root = document.documentElement;
    const systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    const theme = preferences?.theme ?? 'dark';
    const shouldUseLight = theme === 'light' || (theme === 'system' && systemPrefersLight);

    root.classList.toggle('light', shouldUseLight);
    root.classList.toggle('dark', !shouldUseLight);
  }, [preferences?.theme]);

  return null;
}
