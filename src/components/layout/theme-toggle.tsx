import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/hooks/use-local-media";
import type { UserPreferences } from "@/types/media";
import { cn } from "@/shared/lib/cn";

const themeOptions: Array<{ value: UserPreferences["theme"]; label: string; icon: typeof Moon }> = [
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "light", label: "Clair", icon: Sun },
];

export function ThemeToggle() {
  const { data: preferences, updatePreference, isSaving } = usePreferences();
  const activeTheme = preferences?.theme ?? "dark";

  return (
    <div className="flex gap-1">
      {themeOptions.map((option) => {
        const Icon = option.icon;
        const isActive = activeTheme === option.value;
        return (
          <Button
            key={option.value}
            variant="ghost"
            size="sm"
            disabled={isSaving}
            className={cn(
              "flex-1 justify-center gap-2 rounded-2xl px-2 py-2 text-sm font-medium",
              isActive
                ? "bg-primary/15 text-primary shadow-glow"
                : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground"
            )}
            onClick={() => updatePreference({ key: "theme", value: option.value })}
          >
            <Icon className="h-4 w-4" />
            <span className="text-xs">{option.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
