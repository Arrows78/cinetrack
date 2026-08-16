import { unzipSync } from "fflate";

export interface ZipCsvEntry {
  name: string;
  text: string;
}

// A TV Time GDPR export .zip contains far more than the 4 CSVs this feature
// reads (account info, device data, images, ...) — filtering by extension
// before decompressing skips wasting time/memory on everything else.
const CSV_EXTENSION = /\.csv$/i;

// A .zip built on macOS (Finder "Compress", or `zip`/`ditto` without -X)
// carries a "._name" AppleDouble shadow entry next to nearly every real
// file, holding resource-fork/Finder metadata — binary junk that happens
// to keep the original's .csv extension. Left in, this doubled the
// "unrecognized file" count for every real GDPR export and blew out the
// pre-import summary. `__MACOSX/` is the sibling top-level folder some
// tools also add to hold them instead of interleaving.
const isMacosArtifact = (name: string): boolean => {
  const base = name.split("/").pop() ?? name;
  return base.startsWith("._") || name.startsWith("__MACOSX/");
};

// Caps the *decompressed* size, independent of the .zip file's own byte cap
// (MAX_TVTIME_FILE_BYTES in tvtime-import-service.ts, checked before this
// runs) — a small archive can still decompress to something huge (a zip
// bomb), and that's what would actually blow up memory here.
export const MAX_TVTIME_ZIP_ENTRY_BYTES = 50 * 1024 * 1024;
export const MAX_TVTIME_ZIP_TOTAL_BYTES = 150 * 1024 * 1024;

export class ZipTooLargeError extends Error {
  constructor(public readonly entryName: string) {
    super(`Decompressed content of "${entryName}" exceeds the allowed size.`);
    this.name = "ZipTooLargeError";
  }
}

/** Extracts every .csv entry from a .zip File, decoded as UTF-8 text. */
export async function extractCsvEntries(file: File): Promise<ZipCsvEntry[]> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(buffer, {
    filter: (entry) => CSV_EXTENSION.test(entry.name) && !isMacosArtifact(entry.name),
  });

  const decoder = new TextDecoder("utf-8");
  const results: ZipCsvEntry[] = [];
  let totalBytes = 0;
  for (const [path, bytes] of Object.entries(entries)) {
    if (bytes.byteLength > MAX_TVTIME_ZIP_ENTRY_BYTES) throw new ZipTooLargeError(path);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TVTIME_ZIP_TOTAL_BYTES) throw new ZipTooLargeError(path);
    // Zip entries carry their full in-archive path (e.g.
    // "gdpr-data/tracking-prod-records-v2.csv") — only the filename is
    // meaningful for detectFileKind()/user-facing reporting.
    results.push({ name: path.split("/").pop() || path, text: decoder.decode(bytes) });
  }
  return results;
}
