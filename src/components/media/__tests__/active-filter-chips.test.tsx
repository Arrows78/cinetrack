import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { ActiveFilterChips } from "../active-filter-chips";

describe("ActiveFilterChips", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders nothing when there are no active filters", () => {
    const { container } = render(<ActiveFilterChips chips={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one chip per active filter and calls only that chip's onRemove", () => {
    const removeStatus = vi.fn();
    const removeFavourites = vi.fn();
    render(
      <ActiveFilterChips
        chips={[
          { key: "status", label: "Status: Paused", onRemove: removeStatus },
          { key: "favourites", label: "Favourites", onRemove: removeFavourites },
        ]}
      />
    );

    expect(screen.getByText("Status: Paused")).toBeInTheDocument();
    expect(screen.getByText("Favourites")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.removeFilter", { filter: "Status: Paused" }) }));

    expect(removeStatus).toHaveBeenCalledTimes(1);
    expect(removeFavourites).not.toHaveBeenCalled();
  });
});
