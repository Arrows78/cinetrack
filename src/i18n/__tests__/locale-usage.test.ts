import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import en from "../locales/en.json";

// Static guards over the product source: a `t("a.b")` call whose key was never
// added to the locales renders the raw key (the test suites cannot notice,
// since they resolve labels through the very same `i18n.t(key)`), and a
// literal string in JSX or an accessibility attribute is never translated.

const SRC_ROOT = path.resolve(__dirname, "../..");

// Skipped wholesale: tests, generated DTOs, the locale files themselves, and
// the internal developer catalogue (/design-system), which is English-only by
// design (see docs/design-system.md).
const SKIPPED_DIRECTORIES = new Set(["__tests__", "generated", "node_modules", "locales", "design-system"]);
const SKIPPED_FILES = new Set(["design-system-page.tsx"]);

function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) sourceFiles(full, found);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !SKIPPED_FILES.has(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

function flatten(node: unknown, prefix = "", into = new Set<string>()): Set<string> {
  if (typeof node === "object" && node !== null) {
    for (const [key, child] of Object.entries(node)) flatten(child, prefix ? `${prefix}.${key}` : key, into);
  } else {
    into.add(prefix);
  }
  return into;
}

// i18next resolves `key` with a `count` to `key_one`/`key_other`/...
const withoutPluralSuffix = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, "");

const files = sourceFiles(SRC_ROOT);
const parse = (file: string) =>
  ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

describe("translation keys used by the source", () => {
  it('every literal t("…") key exists in en.json', () => {
    const known = new Set([...flatten(en)].map(withoutPluralSuffix));
    const missing: string[] = [];
    for (const file of files) {
      const sourceFile = parse(file);
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          (node.expression.getText() === "t" || node.expression.getText() === "i18n.t") &&
          node.arguments[0] &&
          (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
        ) {
          const key = node.arguments[0].text;
          // Only dotted keys are translation keys: `t("2")` style calls on
          // unrelated functions named `t` would not be.
          if (key.includes(".") && !known.has(key)) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            missing.push(`${path.relative(SRC_ROOT, file)}:${line + 1} ${key}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    expect(missing, `keys used but absent from en.json:\n${missing.join("\n")}`).toEqual([]);
  });
});

// Attributes whose value a user reads, hears (screen reader) or sees in a
// tooltip. A literal here is a string nobody translated.
const USER_FACING_ATTRIBUTES = new Set([
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "placeholder",
  "title",
  "alt",
  "label",
  "description",
  "confirmLabel",
  "cancelLabel",
  "helperText",
  "subtitle",
  "help",
  "groupLabel",
  "recordingLabel",
  "disabledLabel",
]);

// Not words: a keyboard key cap, which is the same in every language.
const ALLOWED_LITERALS = new Set(["Esc"]);

describe("no hard-coded user-facing text in components", () => {
  it("has no literal JSX text or accessibility attribute outside t()", () => {
    const offenders: string[] = [];
    const hasWords = (text: string) => /[A-Za-zÀ-ÿ]{3,}/.test(text) && !ALLOWED_LITERALS.has(text.trim());
    for (const file of files.filter((candidate) => candidate.endsWith(".tsx"))) {
      const sourceFile = parse(file);
      const report = (node: ts.Node, text: string) => {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        offenders.push(`${path.relative(SRC_ROOT, file)}:${line + 1} ${text.trim().slice(0, 60)}`);
      };
      const visit = (node: ts.Node) => {
        if (ts.isJsxText(node)) {
          const text = node
            .getText()
            .replace(/&nbsp;/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (text && hasWords(text)) report(node, text);
        }
        if (ts.isJsxAttribute(node) && node.initializer && USER_FACING_ATTRIBUTES.has(node.name.getText())) {
          const initializer = node.initializer;
          const literal = ts.isStringLiteral(initializer)
            ? initializer
            : ts.isJsxExpression(initializer) &&
                initializer.expression &&
                (ts.isStringLiteral(initializer.expression) ||
                  ts.isNoSubstitutionTemplateLiteral(initializer.expression))
              ? initializer.expression
              : null;
          if (literal && hasWords(literal.text)) report(node, `${node.name.getText()}="${literal.text}"`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    expect(offenders, `untranslated text:\n${offenders.join("\n")}`).toEqual([]);
  });
});
