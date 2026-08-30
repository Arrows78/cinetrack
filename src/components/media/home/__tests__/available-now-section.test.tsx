import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { AvailableNowSection } from "../available-now-section";
import type { AlertStatus } from "@/features/availability/use-availability-alerts";
import type { AvailabilityAlert } from "@/types/media";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params }: PropsWithChildren<{ to: string; params?: Record<string, string> }>) => (
    <a href={to} data-params={params ? JSON.stringify(params) : undefined}>
      {children}
    </a>
  ),
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
  return { alert, matchedProviderIds: [8], available: true };
}

describe("AvailableNowSection", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders nothing for an empty statuses array", () => {
    const { container } = render(<AvailableNowSection statuses={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the section header and one row per status, linking to the right media route", () => {
    render(<AvailableNowSection statuses={[makeStatus()]} />);

    expect(screen.getByRole("heading", { name: i18n.t("home.availableNow") })).toBeInTheDocument();
    expect(screen.getByText("Severance")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("tracking.availableNow"))).toBeInTheDocument();

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/series/$seriesId");
    expect(link).toHaveAttribute("data-params", JSON.stringify({ seriesId: "42" }));
  });

  it("links to the movie route for a movie alert", () => {
    render(<AvailableNowSection statuses={[makeStatus({ mediaType: "movie", mediaId: 7, title: "Dune" })]} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/movies/$movieId");
    expect(link).toHaveAttribute("data-params", JSON.stringify({ movieId: "7" }));
  });
});
