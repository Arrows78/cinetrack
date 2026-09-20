import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { AvailabilityAlertsPage } from "../availability-alerts-page";
import type { AlertStatus } from "@/features/availability/use-availability-alerts";
import type { AvailabilityAlert } from "@/types/media";

const useAvailabilityAlertsMock = vi.fn();
const useAvailabilityStatusMock = vi.fn();
const removeMock = vi.fn();

vi.mock("@/features/availability/use-availability-alerts", () => ({
  useAvailabilityAlerts: () => useAvailabilityAlertsMock(),
  useAvailabilityStatus: () => useAvailabilityStatusMock(),
}));

// Same pattern as tracking-list.test.tsx: no RouterProvider exists in this
// render, so Link is stubbed down to a plain anchor.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params }: PropsWithChildren<{ to: string; params?: Record<string, string> }>) => (
    <a href={to} data-params={params ? JSON.stringify(params) : undefined}>
      {children}
    </a>
  ),
}));

function makeAlert(overrides: Partial<AvailabilityAlert> = {}): AvailabilityAlert {
  return {
    id: "alert-1",
    profileId: "default",
    mediaId: 1,
    mediaType: "movie",
    title: "Dune",
    region: "FR",
    providerIds: [8],
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function mockAlerts(overrides: Partial<ReturnType<typeof useAvailabilityAlertsMock>> = {}) {
  useAvailabilityAlertsMock.mockReturnValue({
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    remove: removeMock,
    isRemoving: false,
    ...overrides,
  });
}

function mockStatus(overrides: Partial<ReturnType<typeof useAvailabilityStatusMock>> = {}) {
  useAvailabilityStatusMock.mockReturnValue({
    availableNow: [] as AlertStatus[],
    pending: [] as AlertStatus[],
    isLoading: false,
    isError: false,
    ...overrides,
  });
}

describe("AvailabilityAlertsPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    useAvailabilityAlertsMock.mockReset();
    useAvailabilityStatusMock.mockReset();
    removeMock.mockReset().mockResolvedValue(undefined);
    mockAlerts();
    mockStatus();
  });

  it("shows a loading state while alerts are still loading", () => {
    mockAlerts({ isLoading: true });
    render(<AvailabilityAlertsPage />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows a remote error state with retry when either query fails", () => {
    const refetch = vi.fn();
    mockAlerts({ isError: true, error: new Error("boom"), refetch });
    render(<AvailabilityAlertsPage />);

    screen.getByRole("button", { name: "Try again" }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state when there are no alerts at all", () => {
    render(<AvailabilityAlertsPage />);

    expect(screen.getByText("No availability alerts")).toBeInTheDocument();
  });

  it("groups an available alert under 'Available now' and a pending one under 'Waiting for availability'", () => {
    const available = makeAlert({ id: "alert-available", title: "Available Movie" });
    const pending = makeAlert({ id: "alert-pending", title: "Pending Series", mediaType: "series" });
    mockStatus({
      availableNow: [{ alert: available, matchedProviderIds: [8], available: true }],
      pending: [{ alert: pending, matchedProviderIds: [], available: false }],
    });
    render(<AvailabilityAlertsPage />);

    const availableHeading = screen.getByRole("heading", { name: "Available now" });
    expect(availableHeading.parentElement).toHaveTextContent("Available Movie");
    const pendingHeading = screen.getByRole("heading", { name: "Waiting for availability" });
    expect(pendingHeading.parentElement).toHaveTextContent("Pending Series");
  });

  it("opens a confirm dialog on remove and removes the alert on confirm", () => {
    const alert = makeAlert({ id: "alert-1", title: "Dune" });
    mockStatus({ pending: [{ alert, matchedProviderIds: [], available: false }] });
    render(<AvailabilityAlertsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Remove the alert for Dune" }));
    expect(screen.getByText('Remove the alert for "Dune"?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(removeMock).toHaveBeenCalledExactlyOnceWith("alert-1");
  });
});
