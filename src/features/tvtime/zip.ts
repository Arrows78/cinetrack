import { unzipSync } from "fflate";

export interface ZipCsvEntry {
  name: string;
  text: string;
}

export interface ZipExtractionLimits {
  maxEntryBytes: number;
  maxTotalBytes: number;
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

const DEFAULT_EXTRACTION_LIMITS: ZipExtractionLimits = {
  maxEntryBytes: MAX_TVTIME_ZIP_ENTRY_BYTES,
  maxTotalBytes: MAX_TVTIME_ZIP_TOTAL_BYTES,
};

export class ZipTooLargeError extends Error {
  constructor(public readonly entryName: string) {
    super(`Decompressed content of "${entryName}" exceeds the allowed size.`);
    this.name = "ZipTooLargeError";
  }
}

/** Extracts every .csv entry from a .zip File, decoded as UTF-8 text. */
export async function extractCsvEntries(
  file: File,
  limits: ZipExtractionLimits = DEFAULT_EXTRACTION_LIMITS,
): Promise<ZipCsvEntry[]> {
  const buffer = new Uint8Array(await file.arrayBuffer());

  // Rejecting on `entry.originalSize` — the decompressed size declared in
  // the zip's central directory — inside the filter itself means an
  // oversized entry is refused before fflate ever inflates its bytes into
  // memory. Checking `bytes.byteLength` only after unzipSync returns (the
  // previous approach) checked the size of something already fully
  // decompressed: a small, highly-compressible .csv (a zip bomb) would
  // already have blown up memory/the UI thread by the time that check ran.
  // The filter is consulted once per entry, before that entry is
  // decompressed, so this also lets `runningTotal` reject once the
  // *declared* cumulative size would exceed the cap, without needing to
  // have decompressed anything to know that.
  let runningTotal = 0;
  const entries = unzipSync(buffer, {
    filter: (entry) => {
      if (!CSV_EXTENSION.test(entry.name) || isMacosArtifact(entry.name)) return false;
      if (entry.originalSize > limits.maxEntryBytes) throw new ZipTooLargeError(entry.name);
      runningTotal += entry.originalSize;
      if (runningTotal > limits.maxTotalBytes) throw new ZipTooLargeError(entry.name);
      return true;
    },
  });

  const decoder = new TextDecoder("utf-8");
  const results: ZipCsvEntry[] = [];
  for (const [path, bytes] of Object.entries(entries)) {
    // Zip entries carry their full in-archive path (e.g.
    // "gdpr-data/tracking-prod-records-v2.csv") — only the filename is
    // meaningful for detectFileKind()/user-facing reporting.
    results.push({ name: path.split("/").pop() || path, text: decoder.decode(bytes) });
  }
  return results;
}
