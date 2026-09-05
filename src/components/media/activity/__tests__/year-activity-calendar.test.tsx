import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { YearActivityCalendar } from "../year-activity-calendar";

describe("YearActivityCalendar", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders exactly one titled cell per day of the year", () => {
    const { container } = render(<YearActivityCalendar year={2026} dailyCounts={{}} />);
    expect(container.querySelectorAll("[title]")).toHaveLength(365);
  });

  it("labels every weekday row, once each", () => {
    render(<YearActivityCalendar year={2026} dailyCounts={{}} />);
    for (const label of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
  });

  it("labels the week containing each month's 1st, and no other week", () => {
    render(<YearActivityCalendar year={2026} dailyCounts={{}} />);
    for (const label of ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
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
