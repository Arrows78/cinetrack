import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { TagInput } from "../tag-input";

describe("TagInput", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders each existing tag as a removable chip", () => {
    render(<TagInput value={["Comedy", "Drama"]} onChange={vi.fn()} suggestions={[]} ariaLabel="Tags" />);

    expect(screen.getByText("Comedy")).toBeInTheDocument();
    expect(screen.getByText("Drama")).toBeInTheDocument();
  });

  it("removes a tag when its chip button is clicked", () => {
    const onChange = vi.fn();
    render(<TagInput value={["Comedy", "Drama"]} onChange={onChange} suggestions={[]} ariaLabel="Tags" />);

    fireEvent.click(screen.getByRole("button", { name: "Remove tag Comedy" }));

    expect(onChange).toHaveBeenCalledWith(["Drama"]);
  });

  it("adds a brand new tag on Enter, trimmed", () => {
    const onChange = vi.fn();
    render(<TagInput value={[]} onChange={onChange} suggestions={[]} ariaLabel="Tags" />);

    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "  Sci-Fi  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(["Sci-Fi"]);
  });

  it("splits a comma-separated paste into several tags at once", () => {
    const onChange = vi.fn();
    render(<TagInput value={[]} onChange={onChange} suggestions={[]} ariaLabel="Tags" />);

    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "family, sci-fi, sunday" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(["family", "sci-fi", "sunday"]);
  });

  it("does not add a tag that already exists, case-insensitively", () => {
    const onChange = vi.fn();
    render(<TagInput value={["Comedy"]} onChange={onChange} suggestions={[]} ariaLabel="Tags" />);

    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "comedy" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("suggests matching existing tags, excluding ones already selected", () => {
    render(
      <TagInput
        value={["Comedy"]}
        onChange={vi.fn()}
        suggestions={["Comedy", "Comedy-Drama", "Horror"]}
        ariaLabel="Tags"
      />
    );

    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "com" } });

    expect(screen.getByRole("option", { name: "Comedy-Drama" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Comedy" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Horror" })).not.toBeInTheDocument();
  });

  it("adds a clicked suggestion and clears the draft", () => {
    const onChange = vi.fn();
    render(<TagInput value={[]} onChange={onChange} suggestions={["Comedy"]} ariaLabel="Tags" />);

    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "com" } });
    fireEvent.click(screen.getByRole("button", { name: "Comedy" }));

    expect(onChange).toHaveBeenCalledWith(["Comedy"]);
    expect(input).toHaveValue("");
  });

  it("removes the last tag on Backspace when the draft is empty", () => {
    const onChange = vi.fn();
    render(<TagInput value={["Comedy", "Drama"]} onChange={onChange} suggestions={[]} ariaLabel="Tags" />);

    fireEvent.keyDown(screen.getByLabelText("Tags"), { key: "Backspace" });

    expect(onChange).toHaveBeenCalledWith(["Comedy"]);
  });
});
