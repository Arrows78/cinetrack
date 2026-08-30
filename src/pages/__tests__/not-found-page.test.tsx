import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import { NotFoundPage } from "../not-found-page";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
}));

describe("NotFoundPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders the not-found message and a link back home", () => {
    render(<NotFoundPage />);

    // Both the page's own sr-only <h1> (the real document heading) and
    // EmptyState's visible title carry the same text — checking the
    // heading role also proves the visible text renders, without a
    // duplicate-text ambiguity from asserting on the bare string twice.
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByText("This page doesn't exist.")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "Back to home" });
    expect(link).toHaveAttribute("href", "/");
  });
});
