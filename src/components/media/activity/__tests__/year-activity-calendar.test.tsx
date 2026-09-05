import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { YearActivityCalendar } from "../year-activity-calendar";

describe("YearActivityCalendar", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders one visible cell per day of the year plus leading blanks for January 1st's weekday", () => {
    // 2026-01-01 is a Thursday (weekday index 4) — 4 leading blank cells.
    const { container } = render(<YearActivityCalendar year={2026} dailyCounts={{}} />);

    const grids = container.querySelectorAll(".inline-grid");
    const cellsGrid = grids[1]!;
    expect(cellsGrid.children).toHaveLength(4 + 365);
  });

  it("gives every day of the year a row in the accessible fallback table", () => {
    render(<YearActivityCalendar year={2026} dailyCounts={{ "2026-03-01": 2 }} />);

    const rows = screen.getAllByRole("row");
    // 365 days + 1 header row.
    expect(rows).toHaveLength(366);
  });

  it("shows the year in the accessible table caption", () => {
    render(<YearActivityCalendar year={2026} dailyCounts={{}} />);
    expect(screen.getByText("2026 activity")).toBeInTheDocument();
  });

  it("titles a day's cell with its date and watch count", () => {
    const { container } = render(<YearActivityCalendar year={2026} dailyCounts={{ "2026-03-01": 2 }} />);

    const cell = Array.from(container.querySelectorAll("[title]")).find((el) =>
      el.getAttribute("title")?.startsWith("Mar 1, 2026")
    );
    expect(cell).toHaveAttribute("title", "Mar 1, 2026: 2 watches");
  });

  it("renders a legend from least to most intense", () => {
    render(<YearActivityCalendar year={2026} dailyCounts={{}} />);
    expect(screen.getByText("Less")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();
  });
});
