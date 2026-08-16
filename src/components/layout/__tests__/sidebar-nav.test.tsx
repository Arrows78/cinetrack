import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren, ReactNode } from "react";
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

vi.mock("@/features/auth/auth-context", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAuth: () => ({
    configured: false,
    required: false,
    status: "ready",
    session: null,
    user: null,
    error: null,
    clearError: vi.fn(),
    signInWithProvider: vi.fn(),
    requestEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    signOut: vi.fn(),
  }),
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
      "calendar",
      "stats",
      "history",
      "alerts",
      "settings",
    ]) {
      expect(screen.getByRole("link", { name: i18n.t(`nav.${key}`) })).toBeInTheDocument();
    }
  });

  it("still fires onNavigate when a link is clicked, so the mobile sheet can close", () => {
    const onNavigate = vi.fn();
    renderSidebar({ onNavigate });

    screen.getByRole("link", { name: i18n.t("nav.settings") }).click();

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
