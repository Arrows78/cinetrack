import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/features/preferences/use-preferences";
import type { UserPreferences } from "@/types/media";
import { cn } from "@/shared/lib/cn";

export function ThemeToggle() {
  const { t } = useTranslation();
  const { data: preferences, updatePreference, isSaving } = usePreferences();
  const activeTheme = preferences?.theme ?? "dark";

  const themeOptions: Array<{ value: UserPreferences["theme"]; labelKey: string; icon: typeof Moon }> = [
    { value: "dark", labelKey: "theme.dark", icon: Moon },
    { value: "light", labelKey: "theme.light", icon: Sun },
  ];

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
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            )}
            onClick={() => void updatePreference({ key: "theme", value: option.value })}
          >
            <Icon className="h-4 w-4" />
            <span className="text-xs">{t(option.labelKey)}</span>
          </Button>
        );
      })}
    </div>
  );
}
