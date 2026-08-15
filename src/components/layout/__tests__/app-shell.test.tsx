import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren, ReactNode } from "react";
import i18n from "@/i18n";
import { AppShell } from "../app-shell";

const routerState = { pathname: "/" };

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
  Outlet: () => <main data-testid="outlet" />,
  useRouter: () => ({ history: { back: vi.fn() } }),
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

function renderShell(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<AppShell />, { wrapper });
}

describe("AppShell", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders the sidebar navigation and the route outlet", () => {
    renderShell();

    expect(screen.getByTestId("outlet")).toBeInTheDocument();
    expect(screen.getAllByText(i18n.t("sidebar.brand.name")).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link").length).toBeGreaterThan(3);
  });

  it("shows no back control on the home route", () => {
    routerState.pathname = "/";
    renderShell();
    expect(screen.queryByText(i18n.t("common.back"))).not.toBeInTheDocument();
  });

  it("shows the back control on a nested route", () => {
    routerState.pathname = "/movies/42";
    renderShell();
    expect(screen.getByText(i18n.t("common.back"))).toBeInTheDocument();
  });

  it("renders the mobile tab bar's More trigger", () => {
    routerState.pathname = "/";
    renderShell();
    expect(screen.getByRole("button", { name: i18n.t("common.more") })).toBeInTheDocument();
  });
});
