import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { AppShell } from "../app-shell";

const routerState = { pathname: "/" };
const navigateSpy = vi.fn();
const historyBackSpy = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="outlet-content">outlet</div>,
  useRouter: () => ({
    navigate: navigateSpy,
    history: { back: historyBackSpy },
  }),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: routerState.pathname } }),
}));

const updatePreferenceSpy = vi.fn();
let preferencesData: { sidebarCollapsed?: boolean } | undefined = { sidebarCollapsed: false };

vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({
    data: preferencesData,
    updatePreference: updatePreferenceSpy,
  }),
}));

vi.mock("@/components/desktop/command-palette", () => ({
  CommandPalette: () => <div data-testid="command-palette" />,
}));

vi.mock("@/components/layout/mobile-tab-bar", () => ({
  MobileTabBar: () => <div data-testid="mobile-tab-bar" />,
}));

vi.mock("@/components/layout/profile-switcher", () => ({
  ProfileSwitcher: () => <div data-testid="profile-switcher" />,
}));

vi.mock("@/components/layout/sidebar-nav", () => ({
  SidebarNav: ({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) => (
    <div data-testid="sidebar-nav" data-collapsed={collapsed}>
      <button type="button" onClick={onToggleCollapse}>
        toggle-collapse
      </button>
    </div>
  ),
}));

describe("AppShell", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    routerState.pathname = "/";
    preferencesData = { sidebarCollapsed: false };
    navigateSpy.mockClear();
    historyBackSpy.mockClear();
    updatePreferenceSpy.mockClear();
    Object.defineProperty(window, "history", {
      value: { length: 2, back: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  it("renders the Outlet inside the animated content area", () => {
    render(<AppShell />);

    expect(screen.getByTestId("outlet-content")).toBeInTheDocument();
  });

  it("does not render a back button on the root route", () => {
    routerState.pathname = "/";
    render(<AppShell />);

    expect(screen.queryByRole("button", { name: i18n.t("common.back") })).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t("common.back"))).not.toBeInTheDocument();
  });

  it("renders back buttons (mobile header + desktop) on a non-root route", () => {
    routerState.pathname = "/movies/42";
    render(<AppShell />);

    // Both the mobile header's icon-only Button (aria-label) and the
    // desktop button (visible text) resolve to the accessible name "Back".
    expect(screen.getAllByRole("button", { name: i18n.t("common.back") })).toHaveLength(2);
    // Desktop back button renders the label as visible text.
    expect(screen.getByText(i18n.t("common.back"))).toBeInTheDocument();
  });

  it("calls router.history.back() (not navigate) when window.history.length > 1", () => {
    routerState.pathname = "/movies/42";
    Object.defineProperty(window, "history", {
      value: { length: 3, back: vi.fn() },
      writable: true,
      configurable: true,
    });
    render(<AppShell />);

    screen.getAllByRole("button", { name: i18n.t("common.back") })[0]!.click();

    expect(historyBackSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  describe("handleGoBack fallback (window.history.length <= 1)", () => {
    beforeEach(() => {
      Object.defineProperty(window, "history", {
        value: { length: 1, back: vi.fn() },
        writable: true,
        configurable: true,
      });
    });

    it("falls back to the series detail route from a season path, capturing only the series segment", () => {
      routerState.pathname = "/series/42/season/3";
      render(<AppShell />);

      screen.getAllByRole("button", { name: i18n.t("common.back") })[0]!.click();

      expect(historyBackSpy).not.toHaveBeenCalled();
      expect(navigateSpy).toHaveBeenCalledWith({ to: "/series/42" });
    });

    it("falls back to /series from a series detail path with no season segment", () => {
      routerState.pathname = "/series/42";
      render(<AppShell />);

      screen.getAllByRole("button", { name: i18n.t("common.back") })[0]!.click();

      expect(navigateSpy).toHaveBeenCalledWith({ to: "/series" });
    });

    it("falls back to /movies from a movie detail path", () => {
      routerState.pathname = "/movies/42";
      render(<AppShell />);

      screen.getAllByRole("button", { name: i18n.t("common.back") })[0]!.click();

      expect(navigateSpy).toHaveBeenCalledWith({ to: "/movies" });
    });

    it("falls back to /people from a person detail path", () => {
      routerState.pathname = "/people/42";
      render(<AppShell />);

      screen.getAllByRole("button", { name: i18n.t("common.back") })[0]!.click();

      expect(navigateSpy).toHaveBeenCalledWith({ to: "/people" });
    });

    it("falls back to / for any other unrecognized path", () => {
      routerState.pathname = "/settings";
      render(<AppShell />);

      screen.getAllByRole("button", { name: i18n.t("common.back") })[0]!.click();

      expect(navigateSpy).toHaveBeenCalledWith({ to: "/" });
    });
  });

  describe("sidebar collapse", () => {
    it("uses the expanded grid-column class and marks SidebarNav as not collapsed by default", () => {
      preferencesData = { sidebarCollapsed: false };
      const { container } = render(<AppShell />);

      expect(container.querySelector(".lg\\:grid-cols-\\[17\\.5rem_minmax\\(0\\,1fr\\)\\]")).toBeInTheDocument();
      expect(container.querySelector(".lg\\:grid-cols-\\[5rem_minmax\\(0\\,1fr\\)\\]")).not.toBeInTheDocument();
      expect(screen.getByTestId("sidebar-nav")).toHaveAttribute("data-collapsed", "false");
    });

    it("uses the collapsed grid-column class when preferences.sidebarCollapsed is true", () => {
      preferencesData = { sidebarCollapsed: true };
      const { container } = render(<AppShell />);

      expect(container.querySelector(".lg\\:grid-cols-\\[5rem_minmax\\(0\\,1fr\\)\\]")).toBeInTheDocument();
      expect(container.querySelector(".lg\\:grid-cols-\\[17\\.5rem_minmax\\(0\\,1fr\\)\\]")).not.toBeInTheDocument();
      expect(screen.getByTestId("sidebar-nav")).toHaveAttribute("data-collapsed", "true");
    });

    it("calls updatePreference with the toggled value when SidebarNav's onToggleCollapse fires", () => {
      preferencesData = { sidebarCollapsed: false };
      render(<AppShell />);

      screen.getByRole("button", { name: "toggle-collapse" }).click();

      expect(updatePreferenceSpy).toHaveBeenCalledWith({ key: "sidebarCollapsed", value: true });
    });

    it("toggles back to false when currently collapsed", () => {
      preferencesData = { sidebarCollapsed: true };
      render(<AppShell />);

      screen.getByRole("button", { name: "toggle-collapse" }).click();

      expect(updatePreferenceSpy).toHaveBeenCalledWith({ key: "sidebarCollapsed", value: false });
    });
  });
});
