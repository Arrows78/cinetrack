import { ShieldCheck } from "lucide-react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import i18n from "@/i18n";
import { AuthBackLink } from "../auth-back-link";
import { AuthBackdrop } from "../auth-backdrop";
import { AuthBrandMark } from "../auth-brand-mark";
import { AuthStepIcon } from "../auth-step-icon";
import { AuthTextField } from "../auth-text-field";
import { ProviderIcon } from "../provider-icon";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("auth atoms", () => {
  it("renders the translated brand tagline and name", () => {
    render(<AuthBrandMark />);

    expect(screen.getByText("Cinema OS")).toBeInTheDocument();
    expect(screen.getByText("CineTrack")).toBeInTheDocument();
  });

  it("renders the given LucideIcon inside its badge", () => {
    const { container } = render(<AuthStepIcon icon={ShieldCheck} />);

    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass("h-6", "w-6");
  });

  it("renders an icon-prefixed Input, forwards input props, and applies rowClassName", () => {
    const onChange = vi.fn();
    const { container } = render(
      <AuthTextField
        icon={ShieldCheck}
        value="jane@example.com"
        onChange={onChange}
        placeholder="Email"
        aria-label="Email address"
        rowClassName="my-row-class"
      />
    );

    const input = screen.getByRole("textbox", { name: "Email address" });
    expect(input).toHaveValue("jane@example.com");
    expect(input).toHaveAttribute("placeholder", "Email");

    fireEvent.change(input, { target: { value: "jane@doe.com" } });
    expect(onChange).toHaveBeenCalledTimes(1);

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("my-row-class");
  });

  it("renders its children and calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<AuthBackLink onClick={onClick}>Back to sign in</AuthBackLink>);

    const button = screen.getByRole("button", { name: /Back to sign in/ });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a distinct SVG per provider", () => {
    const { container: googleContainer } = render(<ProviderIcon provider="google" />);
    const googlePaths = googleContainer.querySelectorAll("path");
    expect(googlePaths).toHaveLength(4);
    expect(googlePaths[0]).toHaveAttribute("fill", "#4285F4");

    const { container: facebookContainer } = render(<ProviderIcon provider="facebook" />);
    const facebookPaths = facebookContainer.querySelectorAll("path");
    expect(facebookPaths).toHaveLength(1);
    expect(facebookPaths[0]?.getAttribute("d")).toContain("M13.7 22");

    const { container: appleContainer } = render(<ProviderIcon provider="apple" />);
    const applePaths = appleContainer.querySelectorAll("path");
    expect(applePaths).toHaveLength(1);
    expect(applePaths[0]?.getAttribute("d")).toContain("M17.05 12.54");

    const { container: xContainer } = render(<ProviderIcon provider="x" />);
    const xPaths = xContainer.querySelectorAll("path");
    expect(xPaths).toHaveLength(1);
    expect(xPaths[0]?.getAttribute("d")).toContain("M18.9 2H22");
  });

  it("renders its 9 backdrop tiles with translated title, genre, and rating, without crashing", () => {
    render(<AuthBackdrop />);

    expect(screen.getByText("Midnight")).toBeInTheDocument();
    expect(screen.getByText("Red Horizon")).toBeInTheDocument();
    expect(screen.getByText("The Voyage")).toBeInTheDocument();
    expect(screen.getByText("Neon City")).toBeInTheDocument();
    expect(screen.getByText("The Archive")).toBeInTheDocument();
    expect(screen.getByText("Last Signal")).toBeInTheDocument();
    expect(screen.getByText("Wild North")).toBeInTheDocument();
    expect(screen.getByText("Afterglow")).toBeInTheDocument();
    expect(screen.getByText("Dust")).toBeInTheDocument();

    expect(screen.getByText("Thriller")).toBeInTheDocument();
    expect(screen.getByText(/7\.8/)).toBeInTheDocument();
  });
});
