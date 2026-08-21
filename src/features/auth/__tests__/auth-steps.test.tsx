import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import i18n from "@/i18n";
import { authConfig } from "@/features/auth/auth-client";
import { AuthEmailStep } from "@/features/auth/auth-email-step";
import { AuthOtpStep } from "@/features/auth/auth-otp-step";
import { AuthProvidersStep } from "@/features/auth/auth-providers-step";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("AuthEmailStep", () => {
  const baseProps = {
    email: "",
    marketingOptIn: false,
    pendingAction: null as string | null,
    onEmailChange: vi.fn(),
    onMarketingOptInToggle: vi.fn(),
    onSubmit: vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault()),
    onBack: vi.fn(),
  };

  it("shows the sign-in title and hides the marketing opt-in checkbox in signin mode", () => {
    render(<AuthEmailStep {...baseProps} mode="signin" />);

    expect(screen.getByRole("heading", { name: "Sign in by email" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows the create-account title and the marketing opt-in checkbox in signup mode, reflecting marketingOptIn", () => {
    const onMarketingOptInToggle = vi.fn();
    const { rerender } = render(
      <AuthEmailStep
        {...baseProps}
        mode="signup"
        marketingOptIn={false}
        onMarketingOptInToggle={onMarketingOptInToggle}
      />
    );

    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toHaveAttribute("aria-checked", "false");

    fireEvent.click(checkbox);
    expect(onMarketingOptInToggle).toHaveBeenCalledTimes(1);

    rerender(
      <AuthEmailStep {...baseProps} mode="signup" marketingOptIn onMarketingOptInToggle={onMarketingOptInToggle} />
    );
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });

  it("wires the email input's value and onChange", () => {
    const onEmailChange = vi.fn();
    render(<AuthEmailStep {...baseProps} mode="signin" email="jane@example.com" onEmailChange={onEmailChange} />);

    const input = screen.getByLabelText("Email address");
    expect(input).toHaveValue("jane@example.com");

    fireEvent.change(input, { target: { value: "new@example.com" } });
    expect(onEmailChange).toHaveBeenCalledWith("new@example.com");
  });

  it("calls onBack when the back link is clicked", () => {
    const onBack = vi.fn();
    render(<AuthEmailStep {...baseProps} mode="signin" onBack={onBack} />);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("calls onSubmit when the form is submitted", () => {
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());
    render(<AuthEmailStep {...baseProps} mode="signin" onSubmit={onSubmit} />);

    fireEvent.submit(screen.getByRole("button", { name: "Send code" }).closest("form")!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("disables the submit button whenever pendingAction is not null, and shows loading only for 'email'", () => {
    const { rerender } = render(<AuthEmailStep {...baseProps} mode="signin" pendingAction={null} />);
    let button = screen.getByRole("button", { name: "Send code" });
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute("aria-busy");

    rerender(<AuthEmailStep {...baseProps} mode="signin" pendingAction="otp" />);
    button = screen.getByRole("button", { name: "Send code" });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute("aria-busy");

    rerender(<AuthEmailStep {...baseProps} mode="signin" pendingAction="email" />);
    button = screen.getByRole("button", { name: "Send code" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});

describe("AuthOtpStep", () => {
  const baseProps = {
    email: "jane@example.com",
    token: "",
    pendingAction: null as string | null,
    resendSeconds: 0,
    onTokenChange: vi.fn(),
    onSubmit: vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault()),
    onResend: vi.fn(),
    onBack: vi.fn(),
  };

  it("sanitizes typed input to digits only, truncated to authConfig.otpLength", () => {
    const onTokenChange = vi.fn();
    render(<AuthOtpStep {...baseProps} onTokenChange={onTokenChange} />);

    const input = screen.getByLabelText("One-time code");
    const raw = "1a2!3-456789";
    fireEvent.change(input, { target: { value: raw } });

    const expected = raw.replace(/\D/g, "").slice(0, authConfig.otpLength);
    expect(expected).toHaveLength(authConfig.otpLength);
    expect(onTokenChange).toHaveBeenCalledWith(expected);
  });

  it("mirrors pendingAction on the submit button's disabled/loading state", () => {
    const { rerender } = render(<AuthOtpStep {...baseProps} pendingAction={null} />);
    let button = screen.getByRole("button", { name: "Verify" });
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute("aria-busy");

    rerender(<AuthOtpStep {...baseProps} pendingAction="resend" />);
    button = screen.getByRole("button", { name: "Verify" });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute("aria-busy");

    rerender(<AuthOtpStep {...baseProps} pendingAction="otp" />);
    button = screen.getByRole("button", { name: "Verify" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("disables resend when resendSeconds > 0 or pendingAction is set, and toggles its label", () => {
    const { rerender } = render(<AuthOtpStep {...baseProps} resendSeconds={0} pendingAction={null} />);
    expect(screen.getByRole("button", { name: "Resend code" })).not.toBeDisabled();

    rerender(<AuthOtpStep {...baseProps} resendSeconds={30} pendingAction={null} />);
    const countdownButton = screen.getByRole("button", { name: "Resend in 30s" });
    expect(countdownButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Resend code" })).not.toBeInTheDocument();

    rerender(<AuthOtpStep {...baseProps} resendSeconds={0} pendingAction="otp" />);
    expect(screen.getByRole("button", { name: "Resend code" })).toBeDisabled();
  });

  it("calls onResend when the resend button is clicked", () => {
    const onResend = vi.fn();
    render(<AuthOtpStep {...baseProps} onResend={onResend} />);

    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
    expect(onResend).toHaveBeenCalledTimes(1);
  });

  it("calls onBack when the back link is clicked", () => {
    const onBack = vi.fn();
    render(<AuthOtpStep {...baseProps} onBack={onBack} />);

    fireEvent.click(screen.getByRole("button", { name: "Change email" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("AuthProvidersStep", () => {
  const baseProps = {
    title: "Welcome back",
    pendingAction: null as string | null,
    providerSettingsStatus: "ready" as const,
    enabledSocialProviders: ["apple", "google", "facebook", "x"] as Array<"apple" | "google" | "facebook" | "x">,
    onProvider: vi.fn(),
    onEmail: vi.fn(),
  };

  const providerButtonName = (label: string) => `Continue with ${label}`;

  it("filters shown providers to enabledSocialProviders when status is 'ready'", () => {
    render(
      <AuthProvidersStep {...baseProps} providerSettingsStatus="ready" enabledSocialProviders={["google", "apple"]} />
    );

    expect(screen.getByRole("button", { name: providerButtonName("google") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: providerButtonName("apple") })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: providerButtonName("facebook") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: providerButtonName("X") })).not.toBeInTheDocument();
  });

  it("falls back to showing all providers when status is 'loading', with its status message", () => {
    render(<AuthProvidersStep {...baseProps} providerSettingsStatus="loading" enabledSocialProviders={["google"]} />);

    expect(screen.getByRole("button", { name: providerButtonName("apple") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: providerButtonName("facebook") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: providerButtonName("google") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: providerButtonName("X") })).toBeInTheDocument();
    expect(screen.getByText("Checking configured sign-in providers…")).toBeInTheDocument();
  });

  it("falls back to showing all providers when status is 'unavailable', with its status message", () => {
    render(<AuthProvidersStep {...baseProps} providerSettingsStatus="unavailable" enabledSocialProviders={[]} />);

    expect(screen.getByRole("button", { name: providerButtonName("apple") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: providerButtonName("facebook") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: providerButtonName("google") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: providerButtonName("X") })).toBeInTheDocument();
    expect(screen.getByText("CineTrack could not verify the provider configuration.")).toBeInTheDocument();
  });

  it("shows the no-providers-enabled warning when 'ready' with an empty enabled list", () => {
    render(<AuthProvidersStep {...baseProps} providerSettingsStatus="ready" enabledSocialProviders={[]} />);

    expect(
      screen.getByText("No social provider is enabled. Configure one in Supabase or continue with email.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: providerButtonName("google") })).not.toBeInTheDocument();
  });

  it("calls onProvider with the clicked provider", () => {
    const onProvider = vi.fn();
    render(<AuthProvidersStep {...baseProps} onProvider={onProvider} />);

    fireEvent.click(screen.getByRole("button", { name: providerButtonName("google") }));
    expect(onProvider).toHaveBeenCalledWith("google");
  });

  it("disables provider buttons when pendingAction is set or status is 'loading'", () => {
    const { rerender } = render(
      <AuthProvidersStep {...baseProps} pendingAction="google" providerSettingsStatus="ready" />
    );
    expect(screen.getByRole("button", { name: providerButtonName("apple") })).toBeDisabled();

    rerender(<AuthProvidersStep {...baseProps} pendingAction={null} providerSettingsStatus="loading" />);
    expect(screen.getByRole("button", { name: providerButtonName("apple") })).toBeDisabled();

    rerender(<AuthProvidersStep {...baseProps} pendingAction={null} providerSettingsStatus="ready" />);
    expect(screen.getByRole("button", { name: providerButtonName("apple") })).not.toBeDisabled();
  });

  it("shows a spinner instead of the icon on the currently-pending provider button", () => {
    render(<AuthProvidersStep {...baseProps} pendingAction="google" />);

    const googleButton = screen.getByRole("button", { name: providerButtonName("google") });
    expect(googleButton.querySelector("svg.animate-spin")).not.toBeNull();

    const appleButton = screen.getByRole("button", { name: providerButtonName("apple") });
    expect(appleButton.querySelector("svg.animate-spin")).toBeNull();
  });

  it("calls onEmail when the email button is clicked", () => {
    const onEmail = vi.fn();
    render(<AuthProvidersStep {...baseProps} onEmail={onEmail} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with email" }));
    expect(onEmail).toHaveBeenCalledTimes(1);
  });
});
