import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { strToU8, zipSync } from "fflate";
import i18n from "@/i18n";
import type * as TvTimeImportServiceModule from "@/features/tvtime/tvtime-import-service";
import { TvTimeImportCard } from "../tvtime-import-card";

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

const applyTvTimeImportMock = vi.fn();
vi.mock("@/features/tvtime/tvtime-import-service", async (importOriginal) => {
  const actual = await importOriginal<typeof TvTimeImportServiceModule>();
  return { ...actual, applyTvTimeImport: (...args: unknown[]) => applyTvTimeImportMock(...args) };
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

  beforeEach(() => {
    toastMock.mockReset();
    applyTvTimeImportMock.mockReset().mockResolvedValue({
      seriesImported: 1,
      episodesImported: 1,
      moviesImported: 0,
      plannedImported: 0,
      unmatched: [],
      ambiguous: [],
    });
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
});
