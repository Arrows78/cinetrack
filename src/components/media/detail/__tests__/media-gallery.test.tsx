import { beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { MediaGallery } from "../media-gallery";

describe("MediaGallery", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders nothing without backdrop paths", () => {
    const { container } = render(<MediaGallery />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing with an empty backdropPaths array", () => {
    const { container } = render(<MediaGallery backdropPaths={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one thumbnail per backdrop and no lightbox until one is clicked", () => {
    render(<MediaGallery backdropPaths={["/a.jpg", "/b.jpg"]} />);

    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the lightbox on the clicked thumbnail's image, and closes it", async () => {
    render(<MediaGallery backdropPaths={["/a.jpg", "/b.jpg"]} />);

    fireEvent.click(screen.getAllByRole("button")[1]!);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector("img")).toHaveAttribute("src", "https://image.tmdb.org/t/p/original/b.jpg");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("navigates to the next and previous image, wrapping around at the ends", async () => {
    render(<MediaGallery backdropPaths={["/a.jpg", "/b.jpg"]} />);

    fireEvent.click(screen.getAllByRole("button")[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector("img")).toHaveAttribute("src", "https://image.tmdb.org/t/p/original/a.jpg");

    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(dialog.querySelector("img")).toHaveAttribute("src", "https://image.tmdb.org/t/p/original/b.jpg");

    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(dialog.querySelector("img")).toHaveAttribute("src", "https://image.tmdb.org/t/p/original/a.jpg");

    fireEvent.click(screen.getByRole("button", { name: "Previous image" }));
    expect(dialog.querySelector("img")).toHaveAttribute("src", "https://image.tmdb.org/t/p/original/b.jpg");
  });

  it("omits prev/next navigation for a single-image gallery", async () => {
    render(<MediaGallery backdropPaths={["/a.jpg"]} />);

    fireEvent.click(screen.getAllByRole("button")[0]!);
    await screen.findByRole("dialog");

    expect(screen.queryByRole("button", { name: "Next image" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous image" })).not.toBeInTheDocument();
  });
});
