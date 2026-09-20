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

  it("renders as a plain textbox with no combobox attributes when no dropdown is given", () => {
    render(<SearchBar value="" onChange={() => undefined} />);

    const input = screen.getByRole("textbox");
    expect(input).not.toHaveAttribute("aria-expanded");
    expect(input).not.toHaveAttribute("aria-controls");
  });

  it("exposes combobox semantics and renders the dropdown when children are given", () => {
    render(
      <SearchBar value="dune" onChange={() => undefined} dropdownOpen dropdownId="search-dropdown">
        <ul id="search-dropdown" role="listbox">
          <li role="option" aria-selected={false}>
            Dune
          </li>
        </ul>
      </SearchBar>
    );

    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", "search-dropdown");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("calls onFocus/onBlur/onKeyDown when provided", () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const onKeyDown = vi.fn();
    render(<SearchBar value="" onChange={() => undefined} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown} />);

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);

    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
