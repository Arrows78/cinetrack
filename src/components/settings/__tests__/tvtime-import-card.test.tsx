import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { strToU8, zipSync } from "fflate";
import type { ReactElement } from "react";
import i18n from "@/i18n";
import type * as TvTimeImportServiceModule from "@/features/tvtime/tvtime-import-service";
import type * as ZipModule from "@/features/tvtime/zip";
import { ZipTooLargeError } from "@/features/tvtime/zip";
import type { RetryableUnmatched } from "@/features/tvtime/tvtime-import-service";
import { TvTimeImportCard } from "../tvtime-import-card";

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

const loggerWarnMock = vi.fn();
vi.mock("@/shared/lib/logger", () => ({ logger: { warn: (...args: unknown[]) => loggerWarnMock(...args) } }));

const applyTvTimeImportMock = vi.fn();
vi.mock("@/features/tvtime/tvtime-import-service", async (importOriginal) => {
  const actual = await importOriginal<typeof TvTimeImportServiceModule>();
  return { ...actual, applyTvTimeImport: (...args: unknown[]) => applyTvTimeImportMock(...args) };
});

// Defaults to the real zip-extraction implementation; individual tests
// override it with mockImplementationOnce to exercise the ZipTooLargeError
// and generic-failure catch branches in prepareImport without needing to
// build an actual 50MB fixture.
const extractCsvEntriesMock = vi.fn();
vi.mock("@/features/tvtime/zip", async (importOriginal) => {
  const actual = await importOriginal<typeof ZipModule>();
  return { ...actual, extractCsvEntries: (...args: [File]) => extractCsvEntriesMock(...args) };
});

const RECORDS_V2 = `s_id,runtime,series_name,episode_number,user_id,gsi,created_at,key,season_number,s_no,ep_no,ep_id,episode_id,updated_at,ep_watch_count,movie_watch_count,total_movies_runtime,total_series_runtime,series_follow_count,is_archived,is_for_later,is_followed,uuid,followed_at,most_recent_ep_watched,is_unitary,bulk_type,is_special,rewatch_count
349310,3660,Bodyguard,6,1,watch-episode-1,2023-11-04 15:30:38,watch-episode-aaa,1,1,6,6733513,6733513,2023-11-04 15:30:38,,,,,,,,,,,,true,,,`;

function csvFile(name: string, text: string): File {
  return new File([text], name, { type: "text/csv" });
}

function zipFile(entries: Record<string, string>): File {
  const bytes = zipSync(
    Object.fromEntries(Object.entries(entries).map(([entryName, content]) => [entryName, strToU8(content)]))
  );
  return new File([bytes], "gdpr-data.zip", { type: "application/zip" });
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(<TvTimeImportCard />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  const input = utils.container.querySelector('input[type="file"]');
  if (!input) throw new Error("file input not found");
  return { ...utils, input: input as HTMLInputElement };
}

describe("TvTimeImportCard", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(async () => {
    toastMock.mockReset();
    loggerWarnMock.mockReset();
    applyTvTimeImportMock.mockReset().mockResolvedValue({
      seriesImported: 1,
      episodesImported: 1,
      moviesImported: 0,
      plannedImported: 0,
      unmatched: [],
      ambiguous: [],
      retryable: [],
    });
    const actualZip = await vi.importActual<typeof ZipModule>("@/features/tvtime/zip");
    extractCsvEntriesMock.mockReset().mockImplementation((file: File) => actualZip.extractCsvEntries(file));
  });

  it("shows a pre-flight summary before running the import, and cancelling runs nothing", async () => {
    const { input } = renderCard();

    fireEvent.change(input, { target: { files: [csvFile("tracking-prod-records-v2.csv", RECORDS_V2)] } });

    expect(await screen.findByText("Import this data?")).toBeInTheDocument();
    expect(screen.getByText(/1 episodes across 1 series/)).toBeInTheDocument();

    screen.getByRole("button", { name: "Cancel" }).click();

    await waitFor(() => expect(screen.queryByText("Import this data?")).not.toBeInTheDocument());
    expect(applyTvTimeImportMock).not.toHaveBeenCalled();
  });

  it("runs the import and shows the completion toast once the user confirms", async () => {
    const { input } = renderCard();

    fireEvent.change(input, { target: { files: [csvFile("tracking-prod-records-v2.csv", RECORDS_V2)] } });
    (await screen.findByRole("button", { name: "Import" })).click();

    await waitFor(() => expect(applyTvTimeImportMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" })));
  });

  it("shows a warning toast instead of success once the import reports unmatched titles", async () => {
    applyTvTimeImportMock.mockResolvedValueOnce({
      seriesImported: 1,
      episodesImported: 1,
      moviesImported: 0,
      plannedImported: 0,
      unmatched: ["Some Unmatched Show"],
      ambiguous: [],
      retryable: [],
    });
    const { input } = renderCard();

    fireEvent.change(input, { target: { files: [csvFile("tracking-prod-records-v2.csv", RECORDS_V2)] } });
    (await screen.findByRole("button", { name: "Import" })).click();

    await waitFor(() => expect(applyTvTimeImportMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "warning" })));
  });

  it("truncates a long current-title instead of letting it grow the card", async () => {
    let resolveImport!: (summary: unknown) => void;
    applyTvTimeImportMock.mockImplementationOnce(
      (_data: unknown, onProgress: (p: unknown) => void) =>
        new Promise((resolve) => {
          resolveImport = resolve;
          onProgress({
            phase: "series",
            done: 1,
            total: 2,
            label: "A Very Long Series Title That Should Never Widen Or Grow This Card",
          });
        })
    );
    const { input } = renderCard();

    fireEvent.change(input, { target: { files: [csvFile("tracking-prod-records-v2.csv", RECORDS_V2)] } });
    (await screen.findByRole("button", { name: "Import" })).click();

    const label = await screen.findByText(/A Very Long Series Title/);
    expect(label).toHaveClass("truncate");

    resolveImport({
      seriesImported: 1,
      episodesImported: 1,
      moviesImported: 0,
      plannedImported: 0,
      unmatched: [],
      ambiguous: [],
      retryable: [],
    });
  });

  it("extracts the CSVs from a selected .zip and includes them in the pre-flight summary", async () => {
    const { input } = renderCard();
    const zip = zipFile({
      "gdpr-data/tracking-prod-records-v2.csv": RECORDS_V2,
      "gdpr-data/notes.txt": "not a csv",
    });

    fireEvent.change(input, { target: { files: [zip] } });

    expect(await screen.findByText(/1 episodes across 1 series/)).toBeInTheDocument();
  });

  it("flags files it couldn't recognize in the pre-flight summary instead of silently dropping them", async () => {
    const { input } = renderCard();
    const unrelated = csvFile("account_info.csv", "email,created_at\nme@example.com,2020-01-01");

    fireEvent.change(input, {
      target: { files: [csvFile("tracking-prod-records-v2.csv", RECORDS_V2), unrelated] },
    });

    expect(await screen.findByText(/account_info\.csv/)).toBeInTheDocument();
  });

  it("caps how many unrecognized names it lists instead of dumping the whole list in the dialog", async () => {
    const { input } = renderCard();
    const unrelated = Array.from({ length: 6 }, (_, index) => csvFile(`unrelated_${index}.csv`, "a,b\n1,2\n"));

    fireEvent.change(input, {
      target: { files: [csvFile("tracking-prod-records-v2.csv", RECORDS_V2), ...unrelated] },
    });

    expect(await screen.findByText(/unrelated_0\.csv/)).toBeInTheDocument();
    expect(screen.getByText(/unrelated_3\.csv/)).toBeInTheDocument();
    expect(screen.queryByText(/unrelated_4\.csv/)).not.toBeInTheDocument();
    expect(screen.getByText(/and 2 more/)).toBeInTheDocument();
  });

  it("does not flag a .zip's macOS AppleDouble shadow files as unrecognized", async () => {
    const { input } = renderCard();
    const zip = zipFile({
      "gdpr-data/tracking-prod-records-v2.csv": RECORDS_V2,
      "gdpr-data/._tracking-prod-records-v2.csv": "resource-fork-junk",
    });

    fireEvent.change(input, { target: { files: [zip] } });

    expect(await screen.findByText(/1 episodes across 1 series/)).toBeInTheDocument();
    expect(screen.queryByText(/wasn't recognized/)).not.toBeInTheDocument();
  });

  it("shows an error and never opens the confirm dialog when nothing selected is recognizable", async () => {
    const { input } = renderCard();

    fireEvent.change(input, {
      target: { files: [csvFile("account_info.csv", "email,created_at\nme@example.com,2020-01-01")] },
    });

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringMatching(/could be read/i), variant: "error" })
      )
    );
    expect(screen.queryByText("Import this data?")).not.toBeInTheDocument();
  });

  it("rejects a selection with more files than the max, without reading any of them", async () => {
    const { input } = renderCard();
    const files = Array.from({ length: 11 }, (_, index) => csvFile(`records_${index}.csv`, RECORDS_V2));

    fireEvent.change(input, { target: { files } });

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Select at most 10 files.", variant: "error" })
      )
    );
    expect(screen.queryByText("Import this data?")).not.toBeInTheDocument();
  });

  it("rejects a single file over the per-file size cap", async () => {
    const { input } = renderCard();
    const file = csvFile("huge.csv", RECORDS_V2);
    Object.defineProperty(file, "size", { value: 50 * 1024 * 1024 + 1 });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: '"huge.csv" is too large to import.', variant: "error" })
      )
    );
    expect(screen.queryByText("Import this data?")).not.toBeInTheDocument();
  });

  it("rejects a selection whose combined size exceeds the total cap even if no single file does", async () => {
    const { input } = renderCard();
    // Each file stays under the per-file cap (50 MB) on its own; only their
    // sum crosses the 150 MB total cap, so this exercises that check
    // specifically rather than the single-file one above it.
    const files = Array.from({ length: 4 }, (_, index) => csvFile(`part-${index}.csv`, RECORDS_V2));
    for (const file of files) Object.defineProperty(file, "size", { value: 40 * 1024 * 1024 });

    fireEvent.change(input, { target: { files } });

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining("more than 150 MB combined"),
          variant: "error",
        })
      )
    );
    expect(screen.queryByText("Import this data?")).not.toBeInTheDocument();
  });

  it("shows a dedicated toast when a .zip's decompressed content exceeds the size cap", async () => {
    extractCsvEntriesMock.mockRejectedValueOnce(new ZipTooLargeError("gdpr-data/huge.csv"));
    const { input } = renderCard();

    fireEvent.change(input, { target: { files: [zipFile({ "gdpr-data/huge.csv": RECORDS_V2 })] } });

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '"gdpr-data/huge.csv" is too large once unzipped.',
          variant: "error",
        })
      )
    );
    expect(screen.queryByText("Import this data?")).not.toBeInTheDocument();
  });

  it("logs and shows a generic read-failure toast when .zip extraction fails for any other reason", async () => {
    extractCsvEntriesMock.mockRejectedValueOnce(new Error("not a valid zip"));
    const { input } = renderCard();

    fireEvent.change(input, { target: { files: [zipFile({ "gdpr-data/records.csv": RECORDS_V2 })] } });

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Couldn't read that file as a .zip archive.", variant: "error" })
      )
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining("not a valid zip"));
    expect(screen.queryByText("Import this data?")).not.toBeInTheDocument();
  });

  it("does nothing when the file input is cleared (no files selected)", async () => {
    const { input } = renderCard();

    fireEvent.change(input, { target: { files: [] } });

    expect(toastMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Import this data?")).not.toBeInTheDocument();
  });

  it("mentions rows skipped for a missing watch date in the pre-flight summary", async () => {
    const withSkippedRow = `${RECORDS_V2}
349311,3660,Bodyguard,7,1,watch-episode-2,,watch-episode-bbb,1,1,7,6733514,6733514,,,,,,,,,,,,,true,,,`;
    const { input } = renderCard();

    fireEvent.change(input, { target: { files: [csvFile("tracking-prod-records-v2.csv", withSkippedRow)] } });

    expect(await screen.findByText(/1 row had no watch date and will be skipped\./)).toBeInTheDocument();
  });

  it("shows the failure toast and logs the error when confirming the import throws", async () => {
    applyTvTimeImportMock.mockRejectedValueOnce(new Error("db write failed"));
    const { input } = renderCard();

    fireEvent.change(input, { target: { files: [csvFile("tracking-prod-records-v2.csv", RECORDS_V2)] } });
    (await screen.findByRole("button", { name: "Import" })).click();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Import failed", variant: "error" })
      )
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining("db write failed"));
  });

  it("warns instead of celebrating when the import reports ambiguous matches, and mentions the count", async () => {
    applyTvTimeImportMock.mockResolvedValueOnce({
      seriesImported: 1,
      episodesImported: 1,
      moviesImported: 0,
      plannedImported: 0,
      unmatched: [],
      ambiguous: ["Guessed Title"],
      retryable: [],
    });
    const { input } = renderCard();

    fireEvent.change(input, { target: { files: [csvFile("tracking-prod-records-v2.csv", RECORDS_V2)] } });
    (await screen.findByRole("button", { name: "Import" })).click();

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "warning" })));
    // toast() is mocked to a plain vi.fn(), so its `description` (a React
    // element built by confirmImport) never reaches the document on its
    // own — render the captured element to assert on the ambiguous wording.
    const toastArg = toastMock.mock.calls[0]![0] as { description: ReactElement };
    render(toastArg.description);
    expect(screen.getByText(/1 match was ambiguous/)).toBeInTheDocument();
  });

  it("surfaces retryable items in the manual-resolution panel below the card", async () => {
    const retryable: RetryableUnmatched[] = [
      {
        kind: "movie",
        label: "Some Unresolved Movie",
        searchTitle: "Some Unresolved Movie",
        searchYear: null,
        movie: {
          title: "Some Unresolved Movie",
          year: null,
          watchedAt: new Date().toISOString(),
          runtimeMinutes: null,
        },
      },
    ];
    applyTvTimeImportMock.mockResolvedValueOnce({
      seriesImported: 0,
      episodesImported: 0,
      moviesImported: 0,
      plannedImported: 0,
      unmatched: [],
      ambiguous: [],
      retryable,
    });
    const { input } = renderCard();

    fireEvent.change(input, { target: { files: [csvFile("tracking-prod-records-v2.csv", RECORDS_V2)] } });
    (await screen.findByRole("button", { name: "Import" })).click();

    // "1 title needs your input" is TvTimeUnmatchedResolver's own card
    // title (tvtimeImport.retry.title) — distinct from the similarly-worded
    // "needs your input below" pointer line inside the (mocked, unrendered)
    // completion toast.
    expect(await screen.findByText("1 title needs your input")).toBeInTheDocument();
    expect(screen.getByText("Some Unresolved Movie")).toBeInTheDocument();
  });
});
