import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { Breadcrumbs } from "../breadcrumbs";

describe("Breadcrumbs", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders every item inside an accessible nav landmark, in order", () => {
    render(
      <Breadcrumbs
        items={[
          <a key="series" href="/series/1">
            Severance
          </a>,
          <span key="season" aria-current="page">
            Season 1
          </span>,
        ]}
      />
    );

    const nav = screen.getByRole("navigation");
    expect(nav).toHaveAccessibleName("Breadcrumb");
    const items = nav.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Severance");
    expect(items[1]).toHaveTextContent("Season 1");
    expect(screen.getByText("Season 1")).toHaveAttribute("aria-current", "page");
  });

  it("renders a single item with no separator", () => {
    render(<Breadcrumbs items={[<span key="only">Only crumb</span>]} />);
    expect(screen.getByText("Only crumb")).toBeInTheDocument();
    expect(document.querySelector("svg")).not.toBeInTheDocument();
  });
});
