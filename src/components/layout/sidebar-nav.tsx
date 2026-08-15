import { useTranslation } from "react-i18next";
import { Link, useRouterState } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeft, Moon, Sun, LogOut } from "lucide-react";
import { useNavigationItems, type NavigationItem } from "@/shared/constants/navigation";
import { cn } from "@/shared/lib/cn";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useAuth } from "@/features/auth/auth-context";

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
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-fast",
        isActive
          ? "bg-primary/15 text-primary shadow-glow"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
        collapsed && "justify-center px-2"
      )}
    >
      <Icon
        className={cn(
          "h-[1.125rem] w-[1.125rem] shrink-0 transition-all duration-fast",
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
  { value: "dark" as const, icon: Moon, labelKey: "sidebar.theme.dark" },
  { value: "light" as const, icon: Sun, labelKey: "sidebar.theme.light" },
];

function getInitials(name: string | null): string {
  if (!name) return "U";
  const parts = name.trim().split(" ").filter(Boolean);
  if (!parts.length) return "U";
  const first = parts[0]?.[0] ?? "";
  if (parts.length === 1) return first.toUpperCase();
  const last = parts[parts.length - 1]?.[0] ?? "";
  return (first + last).toUpperCase();
}

export function SidebarNav({ collapsed, onToggleCollapse }: SidebarNavProps) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigationItems = useNavigationItems();
  const { data: preferences, updatePreference } = usePreferences();
  const { signOut, user } = useAuth();
  const activeTheme = preferences?.theme ?? "dark";
  const userName = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email ?? null;

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
              <p className="text-overline uppercase text-muted-foreground">{t("sidebar.brand.tagline")}</p>
              <p className="text-xl font-bold leading-tight">{t("sidebar.brand.name")}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              aria-label={t("sidebar.collapse")}
              title={t("sidebar.collapse")}
              className="h-8 w-8 shrink-0 hidden bg-foreground/5 hover:bg-foreground/10 lg:flex"
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
          aria-label={t("sidebar.expand")}
          title={t("sidebar.expand")}
          className="mb-3 w-full h-8 justify-center rounded-xl bg-foreground/5 text-foreground hover:bg-foreground/10 hidden lg:flex"
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
          <div className="flex gap-1 rounded-2xl bg-foreground/5 p-1">
            {themeOptions.map(({ value, icon: Icon, labelKey }) => (
              <button
                key={value}
                type="button"
                aria-pressed={activeTheme === value}
                onClick={() => void updatePreference({ key: "theme", value })}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-medium transition-all duration-fast",
                  activeTheme === value
                    ? "bg-primary/15 text-primary shadow-glow"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t(labelKey)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {themeOptions.map(({ value, icon: Icon, labelKey }) => (
              <Button
                key={value}
                variant="ghost"
                size="icon"
                aria-label={t(labelKey)}
                aria-pressed={activeTheme === value}
                title={t(labelKey)}
                className={cn(
                  "h-9 w-full rounded-xl",
                  activeTheme === value && "bg-primary/15 text-primary shadow-glow"
                )}
                onClick={() => void updatePreference({ key: "theme", value })}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
        )}

        {/* User card */}
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl border border-black/[0.07] dark:border-white/5 bg-foreground/5 p-2.5",
            collapsed && "justify-center p-2"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary ring-2 ring-primary/10">
            {getInitials(userName)}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">
                {user?.user_metadata?.full_name ??
                  user?.user_metadata?.name ??
                  user?.email ??
                  t("sidebar.defaultAccount")}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.user_metadata?.role ?? t("sidebar.defaultMember")}
              </p>
            </div>
          )}
          <button
            type="button"
            aria-label={t("sidebar.signOut")}
            title={t("sidebar.signOut")}
            onClick={() => void signOut()}
            className={cn(
              "flex shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground",
              collapsed ? "h-8 w-8" : "h-8 w-8"
            )}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
