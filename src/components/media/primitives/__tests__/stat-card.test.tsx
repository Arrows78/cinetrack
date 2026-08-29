import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard } from "../stat-card";

describe("StatCard", () => {
  it("renders the label and value", () => {
    render(<StatCard label="Watchlist" value="12" />);

    expect(screen.getByText("Watchlist")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders the helper text when provided", () => {
    render(<StatCard label="Watchlist" value="12" helper="titles saved" />);
    expect(screen.getByText("titles saved")).toBeInTheDocument();
  });

  it("omits the helper text when not provided", () => {
    render(<StatCard label="Watchlist" value="12" />);
    expect(screen.queryByText("titles saved")).not.toBeInTheDocument();
  });
});
