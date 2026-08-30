import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { AlertsSection } from "../alerts-section";
import type { AlertStatus } from "@/features/availability/use-availability-alerts";
import type { AvailabilityAlert } from "@/types/media";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
}));

function makeStatus(overrides: Partial<AvailabilityAlert> = {}): AlertStatus {
  const alert: AvailabilityAlert = {
    id: "alert-1",
    profileId: "default",
    mediaId: 42,
    mediaType: "series",
    title: "Severance",
    region: "FR",
    providerIds: [8],
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  return { alert, matchedProviderIds: [], available: false };
}

describe("AlertsSection", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders nothing for an empty statuses array", () => {
    const { container } = render(<AlertsSection statuses={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the pending count, one row per alert, and a manage-alerts link to /tracking", () => {
    render(<AlertsSection statuses={[makeStatus(), makeStatus({ id: "alert-2", title: "Dune", mediaId: 7 })]} />);

    expect(screen.getByRole("heading", { name: i18n.t("home.pendingAlerts") })).toBeInTheDocument();
    expect(screen.getByText(i18n.t("home.pendingAlertsSubtitle", { count: 2 }))).toBeInTheDocument();
    expect(screen.getByText("Severance")).toBeInTheDocument();
    expect(screen.getByText("Dune")).toBeInTheDocument();

    const manageLink = screen.getByRole("link", { name: i18n.t("home.pendingAlertsManageCta") });
    expect(manageLink).toHaveAttribute("href", "/tracking");
  });
});
