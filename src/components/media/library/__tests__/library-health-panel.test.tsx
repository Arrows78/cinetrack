import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { LibraryHealthPanel } from "../library-health-panel";
import type { LibraryItem } from "@/types/media";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params }: PropsWithChildren<{ to: string; params?: Record<string, string> }>) => (
    <a href={to} data-params={params ? JSON.stringify(params) : undefined}>
      {children}
    </a>
  ),
}));

const libraryMock = vi.fn();
vi.mock("@/features/library/use-library", () => ({
  useLibrary: () => libraryMock(),
}));

const { removeMock, restoreMock, setStatusMock, restoreStatusMock } = vi.hoisted(() => ({
  removeMock: vi.fn(),
  restoreMock: vi.fn(),
  setStatusMock: vi.fn(),
  restoreStatusMock: vi.fn(),
}));
vi.mock("@/features/library/use-library-health-actions", () => ({
  useLibraryHealthActions: () => ({
    remove: removeMock,
    restore: restoreMock,
    setStatus: setStatusMock,
    restoreStatus: restoreStatusMock,
    isApplying: false,
  }),
}));

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

function makeItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: "l1",
    profileId: "default",
    mediaId: 7,
    mediaType: "movie",
    title: "Dune",
    posterPath: "/dune.jpg",
    backdropPath: null,
    year: 2021,
    rating: 8,
    genres: ["Science Fiction"],
    status: "planned",
    favourite: false,
    userRating: null,
    notes: null,
    tags: [],
    startedAt: null,
    completedAt: null,
    rewatchCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("LibraryHealthPanel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    libraryMock.mockReset().mockReturnValue({ data: [], isLoading: false });
    removeMock.mockReset().mockResolvedValue(undefined);
    restoreMock.mockReset().mockResolvedValue(undefined);
    setStatusMock.mockReset().mockResolvedValue(undefined);
    restoreStatusMock.mockReset().mockResolvedValue(undefined);
    toastMock.mockReset();
  });

  it("renders nothing when the library has no health issues", () => {
    const { container } = render(<LibraryHealthPanel index={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the library is still loading, even if stale data would otherwise show issues", () => {
    libraryMock.mockReturnValue({
      data: [makeItem({ posterPath: null })],
      isLoading: true,
    });
    const { container } = render(<LibraryHealthPanel index={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a probable-duplicates group and dismisses it on 'not a duplicate'", () => {
    // status "watching" (not "planned") keeps these out of the
    // forgotten-planned-items signal too, so this test only exercises
    // the duplicates card.
    const first = makeItem({ mediaId: 1, title: "The Wire", year: 2002, status: "watching" });
    const second = makeItem({ mediaId: 2, title: "The Wire", year: 2002, status: "watching" });
    libraryMock.mockReturnValue({ data: [first, second], isLoading: false });

    render(<LibraryHealthPanel index={1} />);

    expect(screen.getByRole("heading", { name: i18n.t("library.health.duplicatesTitle") })).toBeInTheDocument();
    expect(screen.getAllByText("The Wire")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: i18n.t("library.health.duplicatesNotDuplicate") }));

    expect(screen.queryByRole("heading", { name: i18n.t("library.health.duplicatesTitle") })).not.toBeInTheDocument();
  });

  it("selects missing-metadata items, removes them after confirming, and offers an undo toast", async () => {
    // status "watching" keeps this out of the forgotten-planned-items
    // signal too, so this test only exercises the missing-metadata card.
    const item = makeItem({ posterPath: null, status: "watching" });
    libraryMock.mockReturnValue({ data: [item], isLoading: false });

    render(<LibraryHealthPanel index={1} />);

    expect(screen.getByRole("heading", { name: i18n.t("library.health.missingMetadataTitle") })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: i18n.t("library.health.selectItem", { title: "Dune" }) }));
    expect(screen.getByText(i18n.t("library.health.selectedCount", { count: 1 }))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("library.health.removeSelected") }));
    expect(
      screen.getByRole("heading", { name: i18n.t("library.health.removeConfirmTitle", { count: 1 }) })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.confirm") }));

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith([item]));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: i18n.t("library.health.undoRemovedDescription", { count: 1 }) })
    );
  });

  it("selects a forgotten planned item and marks it dropped, offering an undo toast", async () => {
    const oldDate = "2000-01-01T00:00:00.000Z";
    const item = makeItem({ updatedAt: oldDate });
    libraryMock.mockReturnValue({ data: [item], isLoading: false });

    render(<LibraryHealthPanel index={1} />);

    expect(screen.getByRole("heading", { name: i18n.t("library.health.stalePlannedTitle") })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: i18n.t("library.health.selectItem", { title: "Dune" }) }));
    fireEvent.click(screen.getByRole("button", { name: i18n.t("library.health.markAsDropped") }));

    await waitFor(() => expect(setStatusMock).toHaveBeenCalledWith([item], "dropped"));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: i18n.t("library.health.undoDroppedDescription", { count: 1 }) })
    );
  });
});
