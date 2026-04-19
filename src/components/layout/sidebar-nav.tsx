import { useTranslation } from "react-i18next";
import { Link, useRouterState } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeft, Moon, Sun } from "lucide-react";
import { useNavigationItems, type NavigationItem } from "@/shared/constants/navigation";
import { cn } from "@/shared/lib/cn";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/hooks/use-local-media";

interface SidebarNavProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavLinkProps {
  item: NavigationItem;
  collapsed: boolean;
  isActive: boolean;
}

function NavLink({ item, collapsed, isActive }: NavLinkProps) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
        isActive
          ? "bg-primary/15 text-primary shadow-glow"
          : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground",
        collapsed && "justify-center px-2"
      )}
    >
      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-all duration-200",
          isActive ? "text-primary" : "group-hover:scale-110"
        )}
      />
      {!collapsed && (
        <>
          <span className="flex-1">{item.label}</span>
          {isActive && <div className="h-1.5 w-1.5 rounded-full bg-primary/70" />}
        </>
      )}
    </Link>
  );
}

const themeOptions = [
  { value: "dark" as const, icon: Moon, label: "Dark" },
  { value: "light" as const, icon: Sun, label: "Light" },
];

function getInitials(name: string | null): string {
  if (!name) return "U";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function SidebarNav({ collapsed, onToggleCollapse }: SidebarNavProps) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigationItems = useNavigationItems();
  const { data: preferences, updatePreference } = usePreferences();
  const activeTheme = preferences?.theme ?? "dark";
  const userName = preferences?.userProfile?.name ?? null;

  const mainItems = navigationItems.filter((item) => item.category === "main");
  const settingsItems = navigationItems.filter((item) => item.category === "settings");

  return (
    <div className={cn("flex h-full flex-col", collapsed ? "px-2 py-4" : "px-4 py-5")}>
      {/* Header */}
      <div className={cn("flex items-center gap-3", collapsed ? "justify-center mb-3" : "mb-6")}>
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-glow",
            collapsed ? "h-10 w-10" : "h-11 w-11"
          )}
        >
          <span className={cn("font-black", collapsed ? "text-base" : "text-lg")}>C</span>
        </div>
        {!collapsed && (
          <div className="flex flex-1 items-center justify-between min-w-0">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                {t("sidebar.brand.tagline")}
              </p>
              <p className="text-xl font-bold leading-tight">{t("sidebar.brand.name")}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className="h-8 w-8 shrink-0 hidden bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 lg:flex"
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
          className="mb-3 w-full h-8 justify-center rounded-xl bg-black/5 dark:bg-white/5 text-foreground hover:bg-black/10 dark:hover:bg-white/10 hidden lg:flex"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      )}

      {/* Navigation — flex-1 distributes space, settings pinned to bottom */}
      <div className="flex-1 min-h-0 flex flex-col justify-between">
        <nav className="space-y-0.5">
          {mainItems.map((item) => (
            <NavLink
              key={item.to}
              item={item}
              collapsed={collapsed}
              isActive={pathname === item.to || pathname.startsWith(`${item.to}/`)}
            />
          ))}
        </nav>

        <nav className="space-y-0.5">
          <Separator className="mb-2 opacity-30" />
          {settingsItems.map((item) => (
            <NavLink
              key={item.to}
              item={item}
              collapsed={collapsed}
              isActive={pathname === item.to || pathname.startsWith(`${item.to}/`)}
            />
          ))}
        </nav>
      </div>

      {/* Footer */}
      <div className="pt-4 space-y-3">
        <Separator className="opacity-30" />

        {/* Theme switcher */}
        {!collapsed ? (
          <div className="flex gap-1 rounded-2xl bg-black/5 dark:bg-white/5 p-1">
            {themeOptions.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => updatePreference({ key: "theme", value })}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-medium transition-all duration-200",
                  activeTheme === value
                    ? "bg-primary/15 text-primary shadow-glow"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {themeOptions.map(({ value, icon: Icon }) => (
              <Button
                key={value}
                variant="ghost"
                size="icon"
                className={cn(
                  "h-9 w-full rounded-xl",
                  activeTheme === value && "bg-primary/15 text-primary shadow-glow"
                )}
                onClick={() => updatePreference({ key: "theme", value })}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
        )}

        {/* User card */}
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl border border-black/[0.07] dark:border-white/5 bg-black/5 dark:bg-white/5 p-2.5",
            collapsed && "justify-center p-2"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary ring-2 ring-primary/10">
            {getInitials(userName)}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{t("sidebar.user")}</p>
              <p className="truncate text-xs text-muted-foreground">{t("sidebar.member")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
