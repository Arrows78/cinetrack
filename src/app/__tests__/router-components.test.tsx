import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { ErrorComponent, PendingComponent, RootLayout } from "../router-components";

const loggerErrorMock = vi.fn();
vi.mock("@/features/diagnostics/logger", () => ({
  logger: { error: (message: string) => loggerErrorMock(message) },
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: () => <div data-testid="app-shell" />,
}));

describe("router-components", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("RootLayout renders AppShell", () => {
    render(<RootLayout />);
    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
  });

  it("PendingComponent renders a loading message", () => {
    render(<PendingComponent />);
    expect(screen.getByText(i18n.t("common.loading"))).toBeInTheDocument();
  });

  it("ErrorComponent logs the route error and renders a fallback message", () => {
    render(<ErrorComponent error={new Error("boom")} reset={() => undefined} info={undefined} />);

    expect(screen.getByText(i18n.t("common.somethingWentWrong"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("errors.unexpectedDescription"))).toBeInTheDocument();
    expect(loggerErrorMock).toHaveBeenCalledWith("Route error: boom");
  });
});
