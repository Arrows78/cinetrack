import { execFileSync } from "node:child_process";
import console from "node:console";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_MIN_COVERAGE = 70;
const COVERAGE_FILE = path.resolve("coverage/coverage-final.json");
const baseSha = process.env.COVERAGE_BASE_SHA?.trim();
const configuredMinimum = Number(process.env.CHANGED_COVERAGE_MIN ?? DEFAULT_MIN_COVERAGE);

if (!baseSha) {
  console.error("COVERAGE_BASE_SHA is required (for example the pull request base SHA).");
  process.exit(2);
}
if (!Number.isFinite(configuredMinimum) || configuredMinimum < 0 || configuredMinimum > 100) {
  console.error("CHANGED_COVERAGE_MIN must be a number between 0 and 100.");
  process.exit(2);
}

const normalizeRepoPath = (filePath) => filePath.replaceAll("\\", "/").replace(/^\.\//, "");

// Keep this aligned with vitest.config.ts's intentional source exclusions.
const COVERAGE_EXCLUDED_SOURCE_FILES = new Set([
  "src/main.tsx",
  "src/app/App.tsx",
  "src/app/router.tsx",
  "src/app/router-config.tsx",
]);

const shouldMeasure = (filePath) => {
  const normalized = normalizeRepoPath(filePath);
  return (
    /^src\/.*\.(?:ts|tsx)$/.test(normalized) &&
    !/\.(?:test|spec)\.(?:ts|tsx)$/.test(normalized) &&
    !normalized.endsWith(".d.ts") &&
    normalized !== "src/test-setup.ts" &&
    !normalized.startsWith("src/generated/") &&
    !COVERAGE_EXCLUDED_SOURCE_FILES.has(normalized)
  );
};

const parseAddedLines = (diff) => {
  const files = new Map();
  let currentFile = null;
  let nextLine = null;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const target = line.slice(4);
      currentFile = target === "/dev/null" ? null : normalizeRepoPath(target.replace(/^b\//, ""));
      nextLine = null;
      continue;
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      nextLine = Number(hunk[1]);
      continue;
    }

    if (!currentFile || nextLine === null || line.startsWith("\\")) continue;

    if (line.startsWith("+")) {
      if (shouldMeasure(currentFile)) {
        const changedLines = files.get(currentFile) ?? new Set();
        changedLines.add(nextLine);
        files.set(currentFile, changedLines);
      }
      nextLine += 1;
    } else if (!line.startsWith("-")) {
      nextLine += 1;
    }
  }

  return files;
};

const diff = execFileSync("git", ["diff", "--unified=0", "--diff-filter=ACMR", `${baseSha}...HEAD`, "--", "src"], {
  encoding: "utf8",
});
const changedLinesByFile = parseAddedLines(diff);

if (changedLinesByFile.size === 0) {
  console.log("Changed frontend coverage: no measurable TypeScript source changes.");
  process.exit(0);
}

const rawCoverage = JSON.parse(readFileSync(COVERAGE_FILE, "utf8"));
const coverageByRepoPath = new Map(
  Object.entries(rawCoverage).map(([filePath, coverage]) => {
    const repoPath = path.isAbsolute(filePath) ? path.relative(process.cwd(), filePath) : filePath;
    return [normalizeRepoPath(repoPath), coverage];
  })
);

let totalChangedStatements = 0;
let coveredChangedStatements = 0;
let failed = false;
const rows = [];

for (const [filePath, changedLines] of [...changedLinesByFile].sort(([a], [b]) => a.localeCompare(b))) {
  const coverage = coverageByRepoPath.get(filePath);
  if (!coverage) {
    console.error(`Changed frontend coverage: ${filePath} is missing from coverage/coverage-final.json.`);
    failed = true;
    continue;
  }

  let fileStatements = 0;
  let fileCovered = 0;
  for (const [statementId, location] of Object.entries(coverage.statementMap ?? {})) {
    const start = location.start?.line;
    const end = location.end?.line;
    if (!Number.isInteger(start) || !Number.isInteger(end)) continue;

    let touchesChangedLine = false;
    for (let line = start; line <= end; line += 1) {
      if (changedLines.has(line)) {
        touchesChangedLine = true;
        break;
      }
    }
    if (!touchesChangedLine) continue;

    fileStatements += 1;
    if ((coverage.s?.[statementId] ?? 0) > 0) fileCovered += 1;
  }

  if (fileStatements === 0) continue;

  totalChangedStatements += fileStatements;
  coveredChangedStatements += fileCovered;
  const percent = (fileCovered / fileStatements) * 100;
  rows.push({ filePath, fileStatements, fileCovered, percent });
}

if (totalChangedStatements === 0) {
  if (failed) process.exit(1);
  console.log("Changed frontend coverage: source changes contain no measurable executable statements.");
  process.exit(0);
}

for (const row of rows) {
  console.log(
    `${row.filePath}: ${row.fileCovered}/${row.fileStatements} changed statements covered (${row.percent.toFixed(1)}%)`
  );
}

const aggregate = (coveredChangedStatements / totalChangedStatements) * 100;
console.log(
  `Changed frontend coverage: ${coveredChangedStatements}/${totalChangedStatements} statements covered (${aggregate.toFixed(1)}%, minimum ${configuredMinimum}%).`
);

if (aggregate + Number.EPSILON < configuredMinimum) {
  console.error(`Changed frontend coverage is below the ${configuredMinimum}% minimum.`);
  failed = true;
}

if (failed) process.exit(1);
