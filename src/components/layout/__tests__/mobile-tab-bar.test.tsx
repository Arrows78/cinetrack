import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren, ReactNode } from "react";
import i18n from "@/i18n";
import { useUiStore } from "@/store/ui-store";
import { MobileTabBar } from "../mobile-tab-bar";

const routerState = { pathname: "/" };

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, onClick }: PropsWithChildren<{ to: string; onClick?: () => void }>) => (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: routerState.pathname } }),
}));

vi.mock("@/features/auth/use-auth", async (importOriginal) => ({
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

vi.mock("@/features/profiles/use-profiles", () => ({
  useProfiles: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({
    data: { theme: "dark", activeProfileId: "default" },
    updatePreference: vi.fn(),
  }),
}));

function renderTabBar(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<MobileTabBar />, { wrapper });
}

describe("MobileTabBar", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    useUiStore.setState({ moreSheetOpen: false });
  });

  it("renders the primary tabs plus a More trigger", () => {
    routerState.pathname = "/";
    renderTabBar();

    expect(screen.getByRole("link", { name: i18n.t("nav.home") })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: i18n.t("nav.search") })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: i18n.t("nav.watchTonight") })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: i18n.t("nav.library") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: i18n.t("common.more") })).toBeInTheDocument();
  });

  it("opens the full navigation in a sheet from the More tab", () => {
    routerState.pathname = "/";
    renderTabBar();

    expect(screen.queryByRole("link", { name: i18n.t("nav.settings") })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.more") }));

    expect(screen.getByRole("link", { name: i18n.t("nav.settings") })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: i18n.t("nav.series") })).toBeInTheDocument();
  });

  it("closes the sheet after picking a destination from it", () => {
    routerState.pathname = "/";
    renderTabBar();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.more") }));
    expect(screen.getByRole("link", { name: i18n.t("nav.settings") })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: i18n.t("nav.series") }));

    expect(screen.queryByRole("link", { name: i18n.t("nav.settings") })).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderTabBar();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no detectable accessibility violations with the More sheet open", async () => {
    renderTabBar();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.more") }));

    expect(screen.getByRole("link", { name: i18n.t("nav.settings") })).toBeInTheDocument();
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
