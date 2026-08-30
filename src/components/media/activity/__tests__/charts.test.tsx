import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { ActivityBarChart, type ActivityBarChartDatum } from "../activity-bar-chart-impl";
import { ViewingHeatmap, type ViewingHeatmapBucket } from "../viewing-heatmap";

// recharts' ResponsiveContainer measures its parent via a ResizeObserver and
// renders nothing when that size is 0 — always the case in jsdom, which has
// no layout engine. Mocked minimally here so ActivityBarChart's own logic
// (the Cell fill it computes per-datum, the Tooltip formatter it builds) is
// exercised directly, without pulling in real chart rendering/measurement.
const cellPropsSpy = vi.fn();
// A holder object, not a reassigned `let`, so reading `formatterHolder.current`
// after `render()` isn't subject to TS's closure narrowing (which would
// otherwise keep treating it as whatever it was assigned right before the
// render call, ignoring that the mocked Tooltip reassigns it during render).
const formatterHolder: { current: ((value: unknown) => [unknown, string]) | undefined } = { current: undefined };

// Reading `formatterHolder.current` through a function, rather than
// inline at each call site, sidesteps a TS quirk where narrowing a
// property to `undefined` right before an opaque `render()` call persists
// across that call — TS has no way to know the mocked Tooltip reassigns it
// during render, so a direct `formatterHolder.current?.(...)` afterwards
// gets typed as `never`.
function capturedFormatter(): (value: unknown) => [unknown, string] {
  const formatter = formatterHolder.current;
  if (!formatter) throw new Error("Tooltip formatter was not captured by the recharts mock");
  return formatter;
}

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Bar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  XAxis: () => null,
  Tooltip: ({ formatter }: { formatter: (value: unknown) => [unknown, string] }) => {
    formatterHolder.current = formatter;
    return null;
  },
  Cell: (props: Record<string, unknown>) => {
    cellPropsSpy(props);
    return null;
  },
}));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("ActivityBarChart", () => {
  const data: ActivityBarChartDatum[] = [
    { label: "Jan", value: 3 },
    { label: "Feb", value: 5 },
    { label: "Mar", value: 1 },
  ];

  it("highlights only the last bar in primary when highlightLast is true", () => {
    cellPropsSpy.mockClear();
    render(<ActivityBarChart data={data} tooltipLabel="watches" highlightLast />);

    expect(cellPropsSpy).toHaveBeenCalledTimes(3);
    const fills = cellPropsSpy.mock.calls.map(([props]) => props.fill as string);
    expect(fills[0]).toBe(fills[1]);
    expect(fills[2]).not.toBe(fills[0]);
    // Last entry gets the primary fill, every other one gets the muted "history" fill.
    expect(fills[2]).toBe("hsl(var(--primary))");
    expect(fills[0]).toBe("hsl(var(--foreground) / 0.12)");
    expect(fills[1]).toBe("hsl(var(--foreground) / 0.12)");
  });

  it("renders no Cell overrides when highlightLast is false", () => {
    cellPropsSpy.mockClear();
    render(<ActivityBarChart data={data} tooltipLabel="watches" highlightLast={false} />);

    expect(cellPropsSpy).not.toHaveBeenCalled();
  });

  it("builds a Tooltip formatter that passes through a normal value", () => {
    formatterHolder.current = undefined;
    render(<ActivityBarChart data={data} tooltipLabel="watches" />);

    expect(capturedFormatter()(5)).toEqual([5, "watches"]);
  });

  it("builds a Tooltip formatter that falls back to 0 for a nullish value", () => {
    formatterHolder.current = undefined;
    render(<ActivityBarChart data={data} tooltipLabel="watches" />);

    expect(capturedFormatter()(undefined)).toEqual([0, "watches"]);
  });
});

describe("ViewingHeatmap", () => {
  function bucketsFor(counts: Record<number, number>): ViewingHeatmapBucket[] {
    // All buckets on day 0 (Sunday), keyed by hour, so each fixture only has
    // to reason about one row.
    return Object.entries(counts).map(([hour, count]) => ({ day: 0, hour: Number(hour), count }));
  }

  // `noUncheckedIndexedAccess` makes plain array indexing return `T |
  // undefined`; these fixtures always have enough elements by construction,
  // so this just asserts that instead of littering every access with `!`.
  function at<T>(list: T[], index: number): T {
    const value = list[index];
    if (value === undefined) throw new Error(`expected an element at index ${index}`);
    return value;
  }

  // The grid is one flat list of children: 1 empty corner + 24 hour headers,
  // then per day a label div + 24 hour cells (7 days total). Day 0's hour
  // cells therefore start right after the header row.
  function dayZeroCells(container: HTMLElement): Element[] {
    const grid = container.querySelector('[aria-hidden="true"].inline-grid');
    if (!grid) throw new Error("heatmap grid not found");
    return Array.from(grid.children).slice(1 + 24 + 1, 1 + 24 + 1 + 24);
  }

  it("shades cells by count relative to the max, across all intensity tiers", () => {
    // max = 8. ratios: 0 -> 0/8=0 (empty), 2 -> 0.25 (25%, not >0.25 -> lowest fill tier),
    // 5 -> 0.625 (>0.5 -> 0.70), 7 -> 0.875 (>0.75 -> full primary), 8 -> 1 (full primary).
    const data = bucketsFor({ 0: 0, 1: 2, 2: 5, 3: 7, 4: 8 });
    const { container } = render(<ViewingHeatmap data={data} />);

    const cells = dayZeroCells(container);

    expect(at(cells, 0).getAttribute("title")).toBe("0 watches");
    expect(at(cells, 0).className).toContain("bg-foreground/[0.04]");

    expect(at(cells, 1).getAttribute("title")).toBe("2 watches");
    expect(at(cells, 1).className).toContain("bg-primary/25");

    expect(at(cells, 2).getAttribute("title")).toBe("5 watches");
    expect(at(cells, 2).className).toContain("bg-primary/70");

    expect(at(cells, 3).getAttribute("title")).toBe("7 watches");
    expect(at(cells, 3).className).toContain("bg-primary");
    expect(at(cells, 3).className).not.toContain("bg-primary/");

    expect(at(cells, 4).getAttribute("title")).toBe("8 watches");
    expect(at(cells, 4).className).toContain("bg-primary");
    expect(at(cells, 4).className).not.toContain("bg-primary/");
  });

  it("falls back to a 0 count (empty tier) for a day/hour with no matching bucket", () => {
    const data = bucketsFor({ 5: 4 });
    const { container } = render(<ViewingHeatmap data={data} />);

    // Hour 0 on day 0 has no bucket entry at all, unlike hour 5.
    const cells = dayZeroCells(container);
    expect(at(cells, 0).getAttribute("title")).toBe("0 watches");
    expect(at(cells, 0).className).toContain("bg-foreground/[0.04]");
    expect(at(cells, 5).getAttribute("title")).toBe("4 watches");
  });

  it("mirrors the visible grid's day/hour/count data in the sr-only table", () => {
    const data = bucketsFor({ 0: 3, 12: 6 });
    const { container } = render(<ViewingHeatmap data={data} />);

    const srOnlyTable = container.querySelector(".sr-only table");
    expect(srOnlyTable).toBeTruthy();

    const rows = Array.from(srOnlyTable?.querySelectorAll("tbody tr") ?? []);
    const rowForHour = (hour: number) => {
      const row = rows.find((candidate) => at(Array.from(candidate.children), 1).textContent === String(hour));
      if (!row) throw new Error(`no sr-only row for hour ${hour}`);
      return Array.from(row.children);
    };

    // Day 0 (Sunday), hour 0 -> count 3.
    const hourZeroCells = rowForHour(0);
    expect(at(hourZeroCells, 0).textContent).toBe("Sun");
    expect(at(hourZeroCells, 2).textContent).toBe("3");

    // Day 0, hour 12 -> count 6.
    const hourTwelveCells = rowForHour(12);
    expect(at(hourTwelveCells, 0).textContent).toBe("Sun");
    expect(at(hourTwelveCells, 2).textContent).toBe("6");

    // A row with no matching bucket mirrors the 0 fallback shown in the grid.
    const hourOneCells = rowForHour(1);
    expect(at(hourOneCells, 2).textContent).toBe("0");
  });

  it("only labels the hour column header every 3rd hour", () => {
    render(<ViewingHeatmap data={[]} />);

    const grid = document.querySelector('[aria-hidden="true"].inline-grid');
    if (!grid) throw new Error("heatmap grid not found");
    const headerCells = Array.from(grid.children).slice(1, 25);
    expect(headerCells).toHaveLength(24);

    headerCells.forEach((cell, hour) => {
      expect(cell.textContent).toBe(hour % 3 === 0 ? String(hour) : "");
    });
  });

  it("falls back to a 0 count for every cell when given no data at all", () => {
    render(<ViewingHeatmap data={[]} />);
    // Every one of the 24 hours on every one of the 7 days falls back to 0.
    const zeroTitledCells = screen.getAllByTitle("0 watches");
    expect(zeroTitledCells).toHaveLength(7 * 24);
  });
});
