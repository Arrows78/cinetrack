import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import i18n from "@/i18n";
import { SearchBar } from "../search-bar";

describe("SearchBar", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("emits text changes and accepts a custom placeholder", () => {
    const onChange = vi.fn();
    render(<SearchBar value="matrix" onChange={onChange} placeholder="Find a title" />);

    const input = screen.getByPlaceholderText("Find a title");
    expect(input).toHaveValue("matrix");

    fireEvent.change(input, { target: { value: "arrival" } });
    expect(onChange).toHaveBeenCalledWith("arrival");
  });

  it("uses the localized placeholder by default", () => {
    render(<SearchBar value="" onChange={() => undefined} />);

    expect(screen.getByPlaceholderText(i18n.t("searchBar.placeholder"))).toBeInTheDocument();
  });
});
