import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import type { CastMember } from "@/types/media";
import { CastList } from "../cast-list";

function makeCastMember(overrides: Partial<CastMember> = {}): CastMember {
  return {
    id: 1,
    name: "Timothée Chalamet",
    character: "Paul Atreides",
    profilePath: "/abc123.jpg",
    ...overrides,
  };
}

describe("CastList", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders the TMDB image URL when profilePath is set", () => {
    render(<CastList cast={[makeCastMember({ profilePath: "/abc123.jpg" })]} />);

    const image = screen.getByRole("img", { name: "Timothée Chalamet" });
    expect(image).toHaveAttribute("src", "https://image.tmdb.org/t/p/w185/abc123.jpg");
  });

  it("falls back to the placeholder image when profilePath is null", () => {
    render(<CastList cast={[makeCastMember({ profilePath: null })]} />);

    const image = screen.getByRole("img", { name: "Timothée Chalamet" });
    expect(image).not.toHaveAttribute("src", expect.stringContaining("image.tmdb.org"));
  });

  it("shows the character name in the badge when provided", () => {
    render(<CastList cast={[makeCastMember({ character: "Paul Atreides" })]} />);

    expect(screen.getByText("Paul Atreides")).toBeInTheDocument();
  });

  it("falls back to the translated casting label when character is null", () => {
    render(<CastList cast={[makeCastMember({ character: null as unknown as undefined })]} />);

    expect(screen.getByText("Cast")).toBeInTheDocument();
  });

  it("falls back to the translated casting label when character is undefined", () => {
    render(<CastList cast={[makeCastMember({ character: undefined })]} />);

    expect(screen.getByText("Cast")).toBeInTheDocument();
  });

  it("renders one card per cast member", () => {
    render(
      <CastList
        cast={[
          makeCastMember({ id: 1, name: "Timothée Chalamet" }),
          makeCastMember({ id: 2, name: "Zendaya" }),
          makeCastMember({ id: 3, name: "Rebecca Ferguson" }),
        ]}
      />
    );

    expect(screen.getByText("Timothée Chalamet")).toBeInTheDocument();
    expect(screen.getByText("Zendaya")).toBeInTheDocument();
    expect(screen.getByText("Rebecca Ferguson")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });

  it("renders no cards for an empty cast array without crashing", () => {
    const { container } = render(<CastList cast={[]} />);

    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(container.querySelector(".grid")?.children).toHaveLength(0);
  });
});
