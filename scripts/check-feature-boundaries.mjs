import { readFileSync } from "node:fs";
import process from "node:process";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const featuresRoot = resolve(root, "src", "features");

const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
if (!configPath) throw new Error("Could not find tsconfig.json");

const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) {
  throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
}

const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);

function featureOf(file) {
  const rel = relative(featuresRoot, file);
  if (rel.startsWith("..") || rel === "") return null;
  return rel.split(sep)[0] ?? null;
}

function isPublicFeatureFile(file) {
  const name = basename(file);
  return (
    /^index\.(?:ts|tsx)$/.test(name) ||
    /-repository\.(?:ts|tsx)$/.test(name) ||
    /^use-.*\.(?:ts|tsx)$/.test(name)
  );
}

function resolveImport(specifier, containingFile) {
  const resolved = ts.resolveModuleName(
    specifier,
    containingFile,
    parsed.options,
    ts.sys
  ).resolvedModule?.resolvedFileName;

  if (!resolved) return null;
  if (![".ts", ".tsx"].includes(extname(resolved))) return null;
  return resolve(resolved);
}

function importSpecifiers(sourceFile) {
  const values = [];

  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      values.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      values.push(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return values;
}

const failures = [];
const graph = new Map();

for (const sourceFile of program.getSourceFiles()) {
  if (
    sourceFile.isDeclarationFile ||
    !sourceFile.fileName.startsWith(featuresRoot + sep) ||
    sourceFile.fileName.includes(`${sep}__tests__${sep}`)
  ) {
    continue;
  }

  const sourceFeature = featureOf(sourceFile.fileName);
  if (!sourceFeature) continue;
  if (!graph.has(sourceFeature)) graph.set(sourceFeature, new Set());

  for (const specifier of importSpecifiers(sourceFile)) {
    const targetFile = resolveImport(specifier, sourceFile.fileName);
    if (!targetFile || !targetFile.startsWith(featuresRoot + sep)) continue;

    const targetFeature = featureOf(targetFile);
    if (!targetFeature || targetFeature === sourceFeature) continue;

    graph.get(sourceFeature).add(targetFeature);

    if (!isPublicFeatureFile(targetFile)) {
      failures.push(
        `${relative(root, sourceFile.fileName)} imports private ${targetFeature} implementation ` +
          `"${specifier}" -> ${relative(root, targetFile)}. Cross-feature imports must target ` +
          "index.ts, *-repository.ts, or use-*.ts."
      );
    }
  }
}

const state = new Map();
const stack = [];
const reportedCycles = new Set();

function visitFeature(feature) {
  const current = state.get(feature) ?? 0;
  if (current === 2) return;
  if (current === 1) {
    const start = stack.indexOf(feature);
    const cycle = [...stack.slice(start), feature];
    const rotations = cycle.slice(0, -1).map((_, index) => {
      const nodes = cycle.slice(0, -1);
      const rotated = [...nodes.slice(index), ...nodes.slice(0, index)];
      return [...rotated, rotated[0]].join(" -> ");
    });
    const key = rotations.sort()[0];
    if (!reportedCycles.has(key)) {
      reportedCycles.add(key);
      failures.push(`Feature dependency cycle: ${cycle.join(" -> ")}`);
    }
    return;
  }

  state.set(feature, 1);
  stack.push(feature);
  for (const dependency of graph.get(feature) ?? []) {
    visitFeature(dependency);
  }
  stack.pop();
  state.set(feature, 2);
}

for (const feature of graph.keys()) {
  visitFeature(feature);
}

if (failures.length > 0) {
  process.stderr.write(
    "Frontend feature-boundary violations detected:\n\n" +
      failures.map((failure) => `  - ${failure}`).join("\n") +
      "\n\nExpose cross-feature APIs through a *-repository.ts/use-*.ts public surface (or index.ts when a feature needs a curated barrel), and keep the feature graph acyclic.\n"
  );
  process.exit(1);
}
