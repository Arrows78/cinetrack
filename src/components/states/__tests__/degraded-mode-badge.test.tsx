import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { DegradedModeBadge } from "../degraded-mode-badge";

describe("DegradedModeBadge", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows the same offline message as the global indicator, contextualized to one section", () => {
    render(<DegradedModeBadge />);
    expect(screen.getByText(i18n.t("offline.message"))).toBeInTheDocument();
  });
});
