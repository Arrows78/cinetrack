import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { extractCsvEntries } from "../zip";

function zipFile(entries: Record<string, string>): File {
  const bytes = zipSync(Object.fromEntries(Object.entries(entries).map(([name, content]) => [name, strToU8(content)])));
  return new File([bytes], "export.zip", { type: "application/zip" });
}

const SMALL_TEST_LIMITS = {
  maxEntryBytes: 16,
  maxTotalBytes: 24,
};

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

  it("rejects an entry whose decompressed size exceeds the cap", async () => {
    const file = zipFile({
      "big.csv": "x".repeat(SMALL_TEST_LIMITS.maxEntryBytes + 1),
    });

    await expect(extractCsvEntries(file, SMALL_TEST_LIMITS)).rejects.toMatchObject({
      name: "ZipTooLargeError",
      entryName: "big.csv",
    });
  });

  it("rejects once the combined declared size of several under-the-per-entry-cap entries exceeds the total cap", async () => {
    const file = zipFile({
      "a.csv": "x".repeat(9),
      "b.csv": "x".repeat(9),
      "c.csv": "x".repeat(9),
    });

    await expect(extractCsvEntries(file, SMALL_TEST_LIMITS)).rejects.toMatchObject({
      name: "ZipTooLargeError",
      entryName: "c.csv",
    });
  });
});
