import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { extractCsvEntries, MAX_TVTIME_ZIP_ENTRY_BYTES, ZipTooLargeError } from "../zip";

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

  it("rejects an entry whose decompressed size exceeds the cap", async () => {
    const huge = "x".repeat(MAX_TVTIME_ZIP_ENTRY_BYTES + 1);
    const file = zipFile({ "big.csv": huge });

    await expect(extractCsvEntries(file)).rejects.toBeInstanceOf(ZipTooLargeError);
  });
});
