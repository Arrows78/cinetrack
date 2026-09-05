import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { ImdbLink } from "../imdb-link";

describe("ImdbLink", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders nothing without an imdbId", () => {
    const { container } = render(<ImdbLink imdbId={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when imdbId is undefined", () => {
    const { container } = render(<ImdbLink />);
    expect(container.firstChild).toBeNull();
  });

  it("links to /title/ for a movie or TV id", () => {
    render(<ImdbLink imdbId="tt1160419" />);
    expect(screen.getByRole("link", { name: "View on IMDb" })).toHaveAttribute(
      "href",
      "https://www.imdb.com/title/tt1160419/"
    );
  });

  it("links to /name/ for a person id", () => {
    render(<ImdbLink imdbId="nm0000093" />);
    expect(screen.getByRole("link", { name: "View on IMDb" })).toHaveAttribute(
      "href",
      "https://www.imdb.com/name/nm0000093/"
    );
  });

  it("opens in a new tab without leaking a referrer", () => {
    render(<ImdbLink imdbId="tt1160419" />);
    const link = screen.getByRole("link", { name: "View on IMDb" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });
});
