import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { vi } from "vitest";

import { Pill } from "../pill";

// Same pattern as catalogue-sections-and-browse.test.tsx's Link mock: expose
// the `search` prop (which Pill branches on) as a stringified `data-search`
// attribute so assertions can inspect exactly what was built, instead of just
// the rendered href.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
    className,
  }: PropsWithChildren<{ to: string; search?: Record<string, unknown>; className?: string }>) => (
    <a href={to} data-search={JSON.stringify(search)} className={className}>
      {children}
    </a>
  ),
}));

function searchOf(label: string): Record<string, unknown> {
  const link = screen.getByText(label);
  return JSON.parse(link.dataset.search ?? "{}");
}

describe("Pill", () => {
  it("renders the label as a link to /search", () => {
    render(<Pill label="Action" />);

    const link = screen.getByText("Action");
    expect(link).toHaveAttribute("href", "/search");
  });

  it("builds a provider search and ignores movieId/seriesId once providerId is set", () => {
    render(<Pill label="Netflix" providerId={8} movieId={28} seriesId={10759} />);

    expect(searchOf("Netflix")).toEqual({ q: "Netflix", scope: "all", provider: "8" });
  });

  it("builds a genre search with both genreMovie and genreSeries when both ids are truthy", () => {
    render(<Pill label="Action" movieId={28} seriesId={10759} />);

    expect(searchOf("Action")).toEqual({ q: "Action", scope: "all", genreMovie: "28", genreSeries: "10759" });
  });

  it("omits genreMovie when movieId is falsy (0) but keeps genreSeries", () => {
    render(<Pill label="Kids" movieId={0} seriesId={10762} />);

    expect(searchOf("Kids")).toEqual({ q: "Kids", scope: "all", genreMovie: undefined, genreSeries: "10762" });
  });

  it("omits genreSeries when seriesId is falsy (0) but keeps genreMovie", () => {
    render(<Pill label="TV Movie" movieId={10770} seriesId={0} />);

    expect(searchOf("TV Movie")).toEqual({
      q: "TV Movie",
      scope: "all",
      genreMovie: "10770",
      genreSeries: undefined,
    });
  });

  it("omits both genreMovie and genreSeries when neither id nor providerId is given", () => {
    render(<Pill label="Untagged" />);

    expect(searchOf("Untagged")).toEqual({
      q: "Untagged",
      scope: "all",
      genreMovie: undefined,
      genreSeries: undefined,
    });
  });

  it("forwards a custom className alongside its base styling", () => {
    render(<Pill label="Styled" className="extra-class" />);

    expect(screen.getByText("Styled")).toHaveClass("extra-class", "rounded-full");
  });
});
