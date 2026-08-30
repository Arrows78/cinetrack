import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import i18n from "@/i18n";
import { SidebarNav } from "../sidebar-nav";

const routerState = { pathname: "/" };

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: PropsWithChildren<{ to: string }>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: routerState.pathname } }),
}));

let authUser: User | null = null;
const signOutMock = vi.fn();
vi.mock("@/features/auth/use-auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAuth: () => ({
    configured: false,
    required: false,
    status: "ready",
    session: null,
    user: authUser,
    error: null,
    clearError: vi.fn(),
    signInWithProvider: vi.fn(),
    requestEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    signOut: signOutMock,
  }),
}));

let preferencesTheme: "dark" | "light" = "dark";
const updatePreferenceMock = vi.fn();
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({
    data: { theme: preferencesTheme },
    updatePreference: updatePreferenceMock,
  }),
}));

vi.mock("@/features/profiles/use-profiles", () => ({
  useProfiles: () => ({ data: [], isLoading: false, isError: false }),
}));

function renderSidebar(props: Partial<Parameters<typeof SidebarNav>[0]> = {}): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<SidebarNav collapsed={false} onToggleCollapse={vi.fn()} {...props} />, { wrapper });
}

describe("SidebarNav", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    routerState.pathname = "/";
    authUser = null;
    signOutMock.mockClear();
    preferencesTheme = "dark";
    updatePreferenceMock.mockClear();
  });

  // Section headers share a fixed class combination distinct from any other
  // text in the sidebar (the footer's fallback account label happens to
  // render the literal string "Account" too), so querying by class avoids
  // false collisions while still asserting all four groups got a header.
  const SECTION_HEADER_SELECTOR = ".mb-1\\.5.px-3.text-overline";

  it("renders every section header when expanded", () => {
    const { container } = renderSidebar();

    const headers = Array.from(container.querySelectorAll(SECTION_HEADER_SELECTOR)).map((node) => node.textContent);
    expect(headers).toEqual([
      i18n.t("sidebar.sections.discover"),
      i18n.t("sidebar.sections.library"),
      i18n.t("sidebar.sections.insights"),
      i18n.t("sidebar.sections.account"),
    ]);
  });

  it("hides section headers when collapsed, keeping links accessible by name", () => {
    const { container } = renderSidebar({ collapsed: true });

    expect(container.querySelectorAll(SECTION_HEADER_SELECTOR)).toHaveLength(0);
    expect(screen.getByRole("link", { name: i18n.t("nav.settings") })).toBeInTheDocument();
  });

  it("keeps every nav item reachable by accessible name regardless of grouping", () => {
    renderSidebar();

    for (const key of [
      "home",
      "series",
      "movies",
      "search",
      "people",
      "watchTonight",
      "library",
      "tracking",
      "stats",
      "history",
      "settings",
    ]) {
      expect(screen.getByRole("link", { name: i18n.t(`nav.${key}`) })).toBeInTheDocument();
    }
  });

  it("gives each section nav a unique accessible name", () => {
    renderSidebar();

    const names = screen.getAllByRole("navigation").map((node) => node.getAttribute("aria-label"));
    expect(names).toEqual([
      i18n.t("nav.home"),
      i18n.t("sidebar.sections.discover"),
      i18n.t("sidebar.sections.library"),
      i18n.t("sidebar.sections.insights"),
      i18n.t("sidebar.sections.account"),
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("still fires onNavigate when a link is clicked, so the mobile sheet can close", () => {
    const onNavigate = vi.fn();
    renderSidebar({ onNavigate });

    screen.getByRole("link", { name: i18n.t("nav.settings") }).click();

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  describe("theme switcher", () => {
    it("marks the active theme pressed and switches preference on click when expanded", () => {
      preferencesTheme = "light";
      renderSidebar();

      const lightButton = screen.getByRole("button", { name: i18n.t("sidebar.theme.light") });
      const darkButton = screen.getByRole("button", { name: i18n.t("sidebar.theme.dark") });
      expect(lightButton).toHaveAttribute("aria-pressed", "true");
      expect(darkButton).toHaveAttribute("aria-pressed", "false");

      darkButton.click();

      expect(updatePreferenceMock).toHaveBeenCalledWith({ key: "theme", value: "dark" });
    });

    it("marks the active theme pressed and switches preference on click when collapsed", () => {
      preferencesTheme = "dark";
      renderSidebar({ collapsed: true });

      const lightButton = screen.getByRole("button", { name: i18n.t("sidebar.theme.light") });
      const darkButton = screen.getByRole("button", { name: i18n.t("sidebar.theme.dark") });
      expect(darkButton).toHaveAttribute("aria-pressed", "true");
      expect(lightButton).toHaveAttribute("aria-pressed", "false");

      lightButton.click();

      expect(updatePreferenceMock).toHaveBeenCalledWith({ key: "theme", value: "light" });
    });
  });

  describe("account card", () => {
    it("shows the default account label and 'U' initials when signed out", () => {
      renderSidebar();

      expect(screen.getByText(i18n.t("sidebar.defaultAccount"), { selector: "p.truncate" })).toBeInTheDocument();
      expect(screen.getByText(i18n.t("sidebar.defaultMember"))).toBeInTheDocument();
      expect(screen.getByText("U")).toBeInTheDocument();
    });

    it("shows the user's full name, role, and two-letter initials when expanded", () => {
      authUser = {
        user_metadata: { full_name: "Ada Lovelace", role: "Admin" },
      } as unknown as User;
      renderSidebar();

      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
      expect(screen.getByText("Admin")).toBeInTheDocument();
      expect(screen.getByText("AL")).toBeInTheDocument();
    });

    it("falls back to the email and a single initial when no name is set", () => {
      authUser = { email: "ada@example.com", user_metadata: {} } as User;
      renderSidebar();

      expect(screen.getByText("ada@example.com")).toBeInTheDocument();
      expect(screen.getByText("A")).toBeInTheDocument();
    });

    it("falls back to 'U' initials when the name is only whitespace", () => {
      authUser = { user_metadata: { full_name: "   " } } as unknown as User;
      renderSidebar();

      expect(screen.getByText("U")).toBeInTheDocument();
    });

    it("shows the user's initials in the collapsed avatar-only card, behind the profile-switch trigger", () => {
      authUser = { user_metadata: { full_name: "Ada Lovelace" } } as unknown as User;
      renderSidebar({ collapsed: true });

      expect(screen.getByText("AL")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: i18n.t("sidebar.switchProfile") })).toBeInTheDocument();
    });

    it("signs out when the sign-out button is clicked, expanded and collapsed", () => {
      const { unmount } = renderSidebar();
      screen.getByRole("button", { name: i18n.t("sidebar.signOut") }).click();
      expect(signOutMock).toHaveBeenCalledTimes(1);
      unmount();

      renderSidebar({ collapsed: true });
      screen.getByRole("button", { name: i18n.t("sidebar.signOut") }).click();
      expect(signOutMock).toHaveBeenCalledTimes(2);
    });
  });

  it("has no detectable accessibility violations when expanded", async () => {
    const { container } = renderSidebar();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no detectable accessibility violations when collapsed", async () => {
    const { container } = renderSidebar({ collapsed: true });

    expect(await axe(container)).toHaveNoViolations();
  });
});
