import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { extractCsvEntries, MAX_TVTIME_ZIP_ENTRY_BYTES, MAX_TVTIME_ZIP_TOTAL_BYTES, ZipTooLargeError } from "../zip";

function zipFile(entries: Record<string, string>): File {
  const bytes = zipSync(Object.fromEntries(Object.entries(entries).map(([name, content]) => [name, strToU8(content)])));
  return new File([bytes], "export.zip", { type: "application/zip" });
}

describe("extractCsvEntries", () => {
  it("extracts only the .csv entries, decoded as text", async () => {
    const file = zipFile({
      "gdpr-data/tracking-prod-records-v2.csv": "a,b\n1,2\n",
      "gdpr-data/followed_tv_show.csv": "x,y\n3,4\n",
      "gdpr-data/account.json": '{"ignored":true}',
      "gdpr-data/photos/avatar.png": "not-a-real-png",
    });

    const entries = await extractCsvEntries(file);

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.name).sort()).toEqual(["followed_tv_show.csv", "tracking-prod-records-v2.csv"]);
    expect(entries.find((entry) => entry.name === "tracking-prod-records-v2.csv")?.text).toBe("a,b\n1,2\n");
  });

  it("returns an empty list for a zip with no CSV entries", async () => {
    const file = zipFile({ "readme.txt": "hello" });
    await expect(extractCsvEntries(file)).resolves.toEqual([]);
  });

  it("drops macOS AppleDouble shadow entries and __MACOSX/ instead of reporting them as real files", async () => {
    const file = zipFile({
      "gdpr-data/tracking-prod-records-v2.csv": "a,b\n1,2\n",
      "gdpr-data/._tracking-prod-records-v2.csv": "resource-fork-junk",
      "__MACOSX/gdpr-data/._followed_tv_show.csv": "resource-fork-junk",
    });

    const entries = await extractCsvEntries(file);

    expect(entries.map((entry) => entry.name)).toEqual(["tracking-prod-records-v2.csv"]);
  });

  // Compressing/decompressing a genuine 50MB+ payload (needed to exercise the
  // real cap, not a stand-in smaller one) reliably takes longer than
  // vitest's 5000ms default on a loaded CI runner — bumped, not slimmed,
  // since a smaller payload wouldn't actually exercise MAX_TVTIME_ZIP_ENTRY_BYTES.
  it("rejects an entry whose decompressed size exceeds the cap", async () => {
    const huge = "x".repeat(MAX_TVTIME_ZIP_ENTRY_BYTES + 1);
    const file = zipFile({ "big.csv": huge });

    await expect(extractCsvEntries(file)).rejects.toBeInstanceOf(ZipTooLargeError);
  }, 20000);

  // Also proves the real fix, just via total rather than per-entry size:
  // rejecting on each entry's declared `originalSize` (from the zip's
  // central directory) as the filter sees it — not on the decompressed
  // byte length measured after the fact — means none of these ever
  // actually gets inflated once the running total would exceed the cap.
  it("rejects once the combined declared size of several under-the-per-entry-cap entries exceeds the total cap", async () => {
    const halfOfTotal = "x".repeat(Math.floor(MAX_TVTIME_ZIP_TOTAL_BYTES / 2) + 1);
    const file = zipFile({ "a.csv": halfOfTotal, "b.csv": halfOfTotal, "c.csv": halfOfTotal });

    await expect(extractCsvEntries(file)).rejects.toBeInstanceOf(ZipTooLargeError);
  }, 20000);
});
