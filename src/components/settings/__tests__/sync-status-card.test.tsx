import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { SyncStatusCard } from "../sync-status-card";

const isTauriAppMock = vi.fn(() => true);
vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => isTauriAppMock() }));

let currentSession: { user: { id: string } } | null = { user: { id: "user-1" } };
vi.mock("@/features/auth/use-auth", () => ({ useAuth: () => ({ session: currentSession }) }));

const getStatusMock = vi.fn();
vi.mock("@/features/sync/sync-repository", () => ({
  syncRepository: { getStatus: (...args: unknown[]) => getStatusMock(...args) },
}));

const runMock = vi.fn();
vi.mock("@/features/sync/sync-service", () => ({
  syncService: { run: (...args: unknown[]) => runMock(...args) },
}));

vi.mock("@/features/preferences/use-preferences", () => ({
  useActiveProfileId: () => "profile-1",
}));

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<SyncStatusCard />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("SyncStatusCard", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    isTauriAppMock.mockReset().mockReturnValue(true);
    currentSession = { user: { id: "user-1" } };
    getStatusMock.mockReset().mockResolvedValue({
      deviceId: "device-1",
      cursor: 1,
      pendingCount: 0,
      failedCount: 0,
      conflictCount: 0,
      lastSyncedAt: null,
    });
    runMock.mockReset().mockResolvedValue({ pushed: 0, pulled: 0, conflicts: 0 });
  });

  it("renders nothing outside Tauri", () => {
    isTauriAppMock.mockReturnValue(false);
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing without an active session", () => {
    currentSession = null;
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows up to date when nothing is pending or failed", async () => {
    renderCard();
    expect(await screen.findByText("Up to date.")).toBeInTheDocument();
  });

  it("shows the pending count over the up-to-date message", async () => {
    getStatusMock.mockResolvedValue({
      deviceId: "device-1",
      cursor: 1,
      pendingCount: 3,
      failedCount: 0,
      conflictCount: 0,
      lastSyncedAt: null,
    });
    renderCard();
    expect(await screen.findByText("3 changes syncing…")).toBeInTheDocument();
  });

  it("shows the failed count ahead of the pending count when both are non-zero", async () => {
    getStatusMock.mockResolvedValue({
      deviceId: "device-1",
      cursor: 1,
      pendingCount: 2,
      failedCount: 1,
      conflictCount: 0,
      lastSyncedAt: null,
    });
    renderCard();
    expect(await screen.findByText("1 change couldn't sync — try again.")).toBeInTheDocument();
  });

  it("shows a distinct conflict badge alongside the failed count", async () => {
    getStatusMock.mockResolvedValue({
      deviceId: "device-1",
      cursor: 1,
      pendingCount: 0,
      failedCount: 1,
      conflictCount: 1,
      lastSyncedAt: null,
    });
    renderCard();
    expect(await screen.findByText("1 change has a conflict that needs attention.")).toBeInTheDocument();
  });

  it("shows never-synced when no sync has completed yet", async () => {
    renderCard();
    expect(await screen.findByText("Not synced yet.")).toBeInTheDocument();
  });

  it("shows the last-synced relative time once a sync has completed", async () => {
    getStatusMock.mockResolvedValue({
      deviceId: "device-1",
      cursor: 1,
      pendingCount: 0,
      failedCount: 0,
      conflictCount: 0,
      lastSyncedAt: new Date().toISOString(),
    });
    renderCard();
    expect(await screen.findByText(/Last synced/)).toBeInTheDocument();
  });

  it("runs the sync engine and refreshes the status when Sync now is clicked", async () => {
    renderCard();
    await screen.findByText("Up to date.");
    getStatusMock.mockResolvedValue({
      deviceId: "device-1",
      cursor: 2,
      pendingCount: 0,
      failedCount: 0,
      conflictCount: 0,
      lastSyncedAt: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));

    await waitFor(() => expect(runMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getStatusMock).toHaveBeenCalledTimes(2));
  });

  it("shows a RemoteErrorState with working retry when the status query fails", async () => {
    const failure = new Error("native call failed");
    getStatusMock.mockRejectedValueOnce(failure).mockResolvedValueOnce({
      deviceId: "device-1",
      cursor: 1,
      pendingCount: 0,
      failedCount: 0,
      conflictCount: 0,
      lastSyncedAt: null,
    });
    renderCard();

    expect(await screen.findByText("Unable to load the catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Up to date.")).toBeInTheDocument();
  });
});
