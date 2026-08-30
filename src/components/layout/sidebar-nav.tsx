import { useTranslation } from "react-i18next";
import { Link, useRouterState } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeft, Moon, Sun, LogOut } from "lucide-react";
import { navigationSections, useNavigationItems, type NavigationItem } from "@/shared/constants/navigation";
import { cn } from "@/shared/lib/cn";
import { BrandMarkIcon } from "@/components/layout/brand-mark-icon";
import { ProfileSwitcher } from "@/components/layout/profile-switcher";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useAuth } from "@/features/auth/auth-context";

interface SidebarNavProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  // Passed when SidebarNav renders inside MobileTabBar's "More" sheet, so
  // picking a destination also closes the sheet instead of leaving it open
  // over the page it just navigated to. The desktop <aside> usage has
  // nothing to close, so it simply omits this prop.
  onNavigate?: () => void;
}

interface NavLinkProps {
  item: NavigationItem;
  collapsed: boolean;
  isActive: boolean;
  onNavigate?: () => void;
}

function NavLink({ item, collapsed, isActive, onNavigate }: NavLinkProps) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
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

interface NavSectionProps {
  labelKey?: string;
  items: NavigationItem[];
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
  // Expanded mode leans on the header text for grouping, so a divider would
  // be redundant there; collapsed mode has no header to read, so a thin
  // divider takes over as the only grouping signal.
  showDivider: boolean;
}

function NavSection({ labelKey, items, collapsed, pathname, onNavigate, showDivider }: NavSectionProps) {
  const { t } = useTranslation();
  if (!items.length) return null;

  return (
    <div>
      {showDivider && <Separator className={cn("mb-2 opacity-30", collapsed && "mx-auto w-8")} />}
      {!collapsed && labelKey && (
        <p className="mb-1.5 px-3 text-overline uppercase text-muted-foreground">{t(labelKey)}</p>
      )}
      <nav className="space-y-0.5" aria-label={t(labelKey ?? "nav.home")}>
        {items.map((item) => (
          <NavLink
            key={item.to}
            item={item}
            collapsed={collapsed}
            isActive={pathname === item.to || pathname.startsWith(`${item.to}/`)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </div>
  );
}

const themeOptions = [
  { value: "dark" as const, icon: Moon, labelKey: "sidebar.theme.dark" },
  { value: "light" as const, icon: Sun, labelKey: "sidebar.theme.light" },
];

// Shared surface recipe for the footer's two grouped blocks (theme switcher,
// account card) — same bordered-panel treatment used by both so the footer
// reads as one consistent "account" region rather than two unrelated bits
// bolted underneath the nav.
const FOOTER_SURFACE_CLASS = "rounded-2xl border border-black/[0.07] dark:border-white/5 bg-foreground/5";

function getInitials(name: string | null): string {
  if (!name) return "U";
  const parts = name.trim().split(" ").filter(Boolean);
  if (!parts.length) return "U";
  const first = parts[0]?.[0] ?? "";
  if (parts.length === 1) return first.toUpperCase();
  const last = parts[parts.length - 1]?.[0] ?? "";
  return (first + last).toUpperCase();
}

export function SidebarNav({ collapsed, onToggleCollapse, onNavigate }: SidebarNavProps) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigationItems = useNavigationItems();
  const { data: preferences, updatePreference } = usePreferences();
  const { signOut, user } = useAuth();
  const activeTheme = preferences?.theme ?? "dark";
  const userName = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email ?? null;

  const groupedSections = navigationSections.map((section) => ({
    ...section,
    items: navigationItems.filter((item) => item.category === section.category),
  }));
  const topSections = groupedSections.filter((section) => section.category !== "account");
  const accountSection = groupedSections.find((section) => section.category === "account");

  return (
    <div className={cn("flex h-full flex-col", collapsed ? "px-2 py-4" : "px-4 py-5")}>
      {/* Header */}
      <div className={cn("flex items-center gap-3", collapsed ? "justify-center mb-3" : "mb-6")}>
        <BrandMarkIcon className={collapsed ? "h-10 w-10" : "h-11 w-11"} />
        {!collapsed && (
          <div className="flex flex-1 items-center justify-between min-w-0">
            <div className="min-w-0">
              <p className="text-overline uppercase text-muted-foreground">{t("sidebar.brand.tagline")}</p>
              <p className="text-xl font-bold leading-tight">{t("sidebar.brand.name")}</p>
            </div>
            <IconTooltip label={t("sidebar.collapse")}>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCollapse}
                aria-label={t("sidebar.collapse")}
                className="h-8 w-8 shrink-0 hidden bg-foreground/5 hover:bg-foreground/10 lg:flex"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </IconTooltip>
          </div>
        )}
      </div>

      {collapsed && (
        <IconTooltip label={t("sidebar.expand")}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            aria-label={t("sidebar.expand")}
            className="mb-3 w-full h-8 justify-center rounded-xl bg-foreground/5 text-foreground hover:bg-foreground/10 hidden lg:flex"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </IconTooltip>
      )}

      {/* Navigation — flex-1 distributes space, account section pinned to bottom */}
      <div className="flex-1 min-h-0 flex flex-col justify-between overflow-y-auto">
        <div className={cn("space-y-4", collapsed && "space-y-2")}>
          {topSections.map((section, index) => (
            <NavSection
              key={section.category}
              labelKey={section.labelKey}
              items={section.items}
              collapsed={collapsed}
              pathname={pathname}
              onNavigate={onNavigate}
              showDivider={collapsed && index > 0}
            />
          ))}
        </div>

        {accountSection && (
          <NavSection
            labelKey={accountSection.labelKey}
            items={accountSection.items}
            collapsed={collapsed}
            pathname={pathname}
            onNavigate={onNavigate}
            showDivider
          />
        )}
      </div>

      {/* Footer — theme switcher and account card, grouped as one region */}
      <div className="pt-4 space-y-3">
        <Separator className="opacity-30" />

        {/* Theme switcher */}
        {!collapsed ? (
          <div className={cn(FOOTER_SURFACE_CLASS, "flex gap-1 p-1")}>
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
          <div className={cn(FOOTER_SURFACE_CLASS, "flex flex-col gap-1 p-1")}>
            {themeOptions.map(({ value, icon: Icon, labelKey }) => (
              <IconTooltip key={value} label={t(labelKey)}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t(labelKey)}
                  aria-pressed={activeTheme === value}
                  className={cn(
                    "h-9 w-full rounded-xl",
                    activeTheme === value && "bg-primary/15 text-primary shadow-glow"
                  )}
                  onClick={() => void updatePreference({ key: "theme", value })}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              </IconTooltip>
            ))}
          </div>
        )}

        {/* Account card — the avatar/name area doubles as the profile
            switcher's trigger (see ProfileSwitcher's `children` prop), so
            switching profiles reads as part of this card rather than a
            second, unrelated control bolted elsewhere in the sidebar.
            Sign-out stays its own separate button: a different action, not
            part of the profile-switch flow. */}
        {!collapsed ? (
          <div className={cn(FOOTER_SURFACE_CLASS, "flex items-center gap-1 p-1.5")}>
            <ProfileSwitcher>
              <button
                type="button"
                aria-label={t("sidebar.switchProfile")}
                title={t("sidebar.switchProfile")}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left transition-colors hover:bg-foreground/5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary shadow-glow ring-2 ring-primary/10">
                  {getInitials(userName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">
                    {user?.user_metadata?.full_name ??
                      user?.user_metadata?.name ??
                      user?.email ??
                      t("sidebar.defaultAccount")}
                  </p>
                  <p className="truncate text-overline uppercase text-muted-foreground">
                    {user?.user_metadata?.role ?? t("sidebar.defaultMember")}
                  </p>
                </div>
              </button>
            </ProfileSwitcher>
            <IconTooltip label={t("sidebar.signOut")}>
              <button
                type="button"
                aria-label={t("sidebar.signOut")}
                onClick={() => void signOut()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </IconTooltip>
          </div>
        ) : (
          <div className={cn(FOOTER_SURFACE_CLASS, "space-y-1 p-1")}>
            {/* Not wrapped in IconTooltip: this button is itself the child
                ProfileSwitcher passes to its own SheetTrigger asChild —
                composing a second asChild layer here isn't a pattern proven
                elsewhere in this codebase, and this trigger is important
                enough not to risk breaking without being able to verify the
                composition live. Keeps the native title as its (imperfect,
                hover-only) fallback instead. */}
            <ProfileSwitcher>
              <button
                type="button"
                aria-label={t("sidebar.switchProfile")}
                title={t("sidebar.switchProfile")}
                className="flex h-9 w-full items-center justify-center rounded-xl transition-colors hover:bg-foreground/5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary shadow-glow ring-2 ring-primary/10">
                  {getInitials(userName)}
                </div>
              </button>
            </ProfileSwitcher>
            <IconTooltip label={t("sidebar.signOut")}>
              <button
                type="button"
                aria-label={t("sidebar.signOut")}
                onClick={() => void signOut()}
                className="flex h-8 w-full items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </IconTooltip>
          </div>
        )}
      </div>
    </div>
  );
}
