// @vitest-environment node
//
// Pure filesystem/data assertions, no DOM needed. Required: under the
// project's default jsdom environment, import.meta.url resolves against
// jsdom's configured `location` (see vitest.config.ts's
// environmentOptions.jsdom.url) instead of the real module file, so
// fileURLToPath(new URL(..., import.meta.url)) throws "The URL must be of
// scheme file" — it sees "http://localhost:1420/..." instead of a file:
// URL. The node environment doesn't have that indirection.
import { readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { componentInventory, componentStateModel, navSections, sheetSides, sheetSizes } from "../catalog-data";

const componentsRoot = fileURLToPath(new URL("../../../components", import.meta.url));

function listComponentSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : listComponentSources(absolutePath);
    }

    if (!entry.isFile() || !entry.name.endsWith(".tsx")) return [];

    const relativePath = relative(componentsRoot, absolutePath).split(sep).join("/");
    return [`components/${relativePath}`];
  });
}

describe("design-system catalog data", () => {
  it("indexes every React component source exactly once", () => {
    const actualSources = componentInventory.map((item) => item.source).sort();
    const componentSources = listComponentSources(componentsRoot).sort();

    expect(actualSources).toEqual(componentSources);
    expect(new Set(actualSources).size).toBe(actualSources.length);
  });

  it("keeps inventory entries complete and searchable", () => {
    for (const item of componentInventory) {
      expect(item.name).not.toHaveLength(0);
      expect(item.group).not.toHaveLength(0);
      expect(item.purpose).not.toHaveLength(0);
      expect(["primitive", "pattern", "feature", "infrastructure"]).toContain(item.layer);
      expect(["live", "reference", "internal"]).toContain(item.coverage);
    }
  });

  it("registers unique navigation and state-model identifiers", () => {
    expect(new Set(navSections.map((section) => section.id)).size).toBe(navSections.length);
    expect(navSections.some((section) => section.id === "inventory")).toBe(true);
    expect(new Set(componentStateModel.map((item) => item.state)).size).toBe(componentStateModel.length);
  });

  it("documents all supported sheet sides and sizes", () => {
    expect(sheetSides.map((side) => side.name)).toEqual(["left", "right", "top", "bottom"]);
    expect(sheetSizes.map((size) => size.name)).toEqual(["sm", "md", "lg", "xl"]);
  });
});
