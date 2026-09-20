import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const DIST = "dist";
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_JS_BYTES = 450 * 1024;

// clerk-js/no-rhc is already the smallest entry point Clerk offers (see
// bootstrapClerkInstance's own doc comment in shared/lib/clerk-instance.ts)
// and is already lazy-loaded via dynamic import — never fetched at all by a
// build with auth unconfigured, and not part of any page's initial-load
// path for one that does. Its own transitive size (an optional Solana
// wallet-adapter chain this app never invokes) is real, but it isn't
// something this repo's own code can shrink further, so it's exempted from
// the per-chunk budget below rather than raising that budget for every
// chunk. Re-check this exemption if clerk-js ever gets a slimmer entry
// point, or an even-larger one appears (this only exempts the exact chunk,
// not the whole vendor prefix).
const EXEMPT_LARGE_CHUNKS = [/^dist\/assets\/clerk\.[\w-]+\.js$/];

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? filesIn(fullPath) : [fullPath];
    })
  );
  return nested.flat();
}

const files = await filesIn(DIST);
const sizes = await Promise.all(files.map(async (file) => [file, (await stat(file)).size]));
const total = sizes.reduce((sum, [, size]) => sum + size, 0);
const largestJs = sizes
  .filter(([file]) => file.endsWith(".js"))
  .filter(([file]) => !EXEMPT_LARGE_CHUNKS.some((pattern) => pattern.test(file)))
  .sort(([, a], [, b]) => b - a)[0];

if (total > MAX_TOTAL_BYTES || (largestJs && largestJs[1] > MAX_JS_BYTES)) {
  console.error(`Bundle budget exceeded: ${(total / 1024 / 1024).toFixed(2)} MB total`);
  if (largestJs) console.error(`Largest JS chunk: ${largestJs[0]} (${(largestJs[1] / 1024).toFixed(0)} KB)`);
  process.exit(1);
}

console.log(`Bundle budget ok: ${(total / 1024 / 1024).toFixed(2)} MB total`);
