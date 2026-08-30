import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { ActivityBarChart } from "../activity-bar-chart";

// Same minimal recharts mock as charts.test.tsx — this file only needs to
// prove the lazy/Suspense wiring resolves to the real chart, not re-verify
// the chart's own Cell/Tooltip logic (already covered there against the
// impl module directly).
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Bar: ({ children }: { children: ReactNode }) => <div data-testid="bar-mock">{children}</div>,
  XAxis: () => null,
  Tooltip: () => null,
  Cell: () => null,
}));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("ActivityBarChart (lazy wrapper)", () => {
  it("resolves the lazy-loaded chart behind Suspense", async () => {
    render(<ActivityBarChart data={[{ label: "Jan", value: 3 }]} tooltipLabel="watches" />);

    // Only the real (dynamically imported) component renders a Bar — its
    // appearance proves the lazy import resolved past the Suspense fallback.
    expect(await screen.findByTestId("bar-mock")).toBeInTheDocument();
  });
});
