import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const DIST = "dist";
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_JS_BYTES = 450 * 1024;

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
const largestJs = sizes.filter(([file]) => file.endsWith(".js")).sort(([, a], [, b]) => b - a)[0];

if (total > MAX_TOTAL_BYTES || (largestJs && largestJs[1] > MAX_JS_BYTES)) {
  console.error(`Bundle budget exceeded: ${(total / 1024 / 1024).toFixed(2)} MB total`);
  if (largestJs) console.error(`Largest JS chunk: ${largestJs[0]} (${(largestJs[1] / 1024).toFixed(0)} KB)`);
  process.exit(1);
}

console.log(`Bundle budget ok: ${(total / 1024 / 1024).toFixed(2)} MB total`);
