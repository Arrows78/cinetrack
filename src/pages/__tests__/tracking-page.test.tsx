import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import i18n from "@/i18n";
import { TrackingPage } from "../tracking-page";

// TrackingList has its own coverage via TrackingPage/MoviesPage/SeriesPage
// composition elsewhere — shallow-mock it so this test only asserts
// TrackingPage's own header, not TrackingList's internals.
vi.mock("@/components/media/tracking-list", () => ({
  TrackingList: () => <div data-testid="tracking-list" />,
}));

describe("TrackingPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders its header and mounts TrackingList", () => {
    render(<TrackingPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Tracking" })).toBeInTheDocument();
    expect(
      screen.getByText("Release dates, upcoming episodes, and availability alerts for what you're following.")
    ).toBeInTheDocument();
    expect(screen.getByTestId("tracking-list")).toBeInTheDocument();
  });
});
