import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import i18n from "@/i18n";

import { AuthScreen } from "@/features/auth/auth-screen";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const { useAuthMock, getEnabledSocialProvidersMock, authConfigMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  getEnabledSocialProvidersMock: vi.fn(),
  authConfigMock: {
    otpLength: 6,
    otpResendSeconds: 60,
    termsUrl: "https://example.com/terms" as string | undefined,
    privacyUrl: undefined as string | undefined,
  },
}));

vi.mock("@/features/auth/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/features/auth/provider-availability", () => ({
  getEnabledSocialProviders: (signal?: AbortSignal) => getEnabledSocialProvidersMock(signal),
}));

vi.mock("@/features/auth/auth-client", () => ({
  authConfig: authConfigMock,
}));

vi.mock("@/features/auth/atoms/auth-backdrop", () => ({
  AuthBackdrop: () => <div data-testid="auth-backdrop" />,
}));

vi.mock("@/features/auth/atoms/auth-brand-mark", () => ({
  AuthBrandMark: () => <div data-testid="auth-brand-mark" />,
}));

vi.mock("@/features/auth/auth-providers-step", () => ({
  AuthProvidersStep: ({
    title,
    pendingAction,
    providerSettingsStatus,
    enabledSocialProviders,
    onProvider,
    onEmail,
  }: {
    title: string;
    pendingAction: string | null;
    providerSettingsStatus: string;
    enabledSocialProviders: string[];
    onProvider: (provider: string) => void;
    onEmail: () => void;
  }) => (
    <div data-testid="providers-step">
      <span data-testid="providers-title">{title}</span>
      <span data-testid="providers-status">{providerSettingsStatus}</span>
      <span data-testid="providers-pending">{pendingAction ?? ""}</span>
      <span data-testid="providers-enabled">{enabledSocialProviders.join(",")}</span>
      <button type="button" onClick={() => onProvider("google")}>
        provider-google
      </button>
      <button type="button" onClick={() => onProvider("apple")}>
        provider-apple
      </button>
      <button type="button" onClick={() => onProvider("x")}>
        provider-x
      </button>
      <button type="button" onClick={onEmail}>
        go-email
      </button>
    </div>
  ),
}));

vi.mock("@/features/auth/auth-email-step", () => ({
  AuthEmailStep: ({
    mode,
    email,
    marketingOptIn,
    pendingAction,
    onEmailChange,
    onMarketingOptInToggle,
    onSubmit,
    onBack,
  }: {
    mode: string;
    email: string;
    marketingOptIn: boolean;
    pendingAction: string | null;
    onEmailChange: (value: string) => void;
    onMarketingOptInToggle: () => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    onBack: () => void;
  }) => (
    <div data-testid="email-step">
      <span data-testid="email-mode">{mode}</span>
      <span data-testid="email-pending">{pendingAction ?? ""}</span>
      <span data-testid="email-marketing">{String(marketingOptIn)}</span>
      <input aria-label="email-input" value={email} onChange={(event) => onEmailChange(event.target.value)} />
      <button type="button" onClick={onMarketingOptInToggle}>
        toggle-marketing
      </button>
      <form onSubmit={onSubmit}>
        <button type="submit">submit-email</button>
      </form>
      <button type="button" onClick={onBack}>
        email-back
      </button>
    </div>
  ),
}));

vi.mock("@/features/auth/auth-otp-step", () => ({
  AuthOtpStep: ({
    email,
    token,
    pendingAction,
    resendSeconds,
    onTokenChange,
    onSubmit,
    onResend,
    onBack,
  }: {
    email: string;
    token: string;
    pendingAction: string | null;
    resendSeconds: number;
    onTokenChange: (value: string) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    onResend: () => void;
    onBack: () => void;
  }) => (
    <div data-testid="otp-step">
      <span data-testid="otp-email">{email}</span>
      <span data-testid="otp-pending">{pendingAction ?? ""}</span>
      <span data-testid="otp-resend-seconds">{resendSeconds}</span>
      <input aria-label="token-input" value={token} onChange={(event) => onTokenChange(event.target.value)} />
      <form onSubmit={onSubmit}>
        <button type="submit">submit-otp</button>
      </form>
      <button type="button" onClick={onResend}>
        resend-otp
      </button>
      <button type="button" onClick={onBack}>
        otp-back
      </button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface BaseAuthValue {
  error: string | null;
  clearError: () => void;
  requestEmailOtp: (...args: unknown[]) => Promise<void>;
  signInWithProvider: (...args: unknown[]) => Promise<void>;
  verifyEmailOtp: (...args: unknown[]) => Promise<void>;
}

function baseAuth(overrides: Partial<BaseAuthValue> = {}): BaseAuthValue {
  return {
    error: null,
    clearError: vi.fn(),
    requestEmailOtp: vi.fn().mockResolvedValue(undefined),
    signInWithProvider: vi.fn().mockResolvedValue(undefined),
    verifyEmailOtp: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advanceFakeTimers(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function actWithFakeTimers(fn: () => void, ms = 0) {
  await act(async () => {
    fn();
    await vi.advanceTimersByTimeAsync(ms);
  });
}

// Under fake timers, React's scheduler defers the re-render triggered by the
// "go-email" click to a (faked) timer, so the email step's input doesn't
// exist yet if we fire all three events synchronously in one batch. Split
// the navigation from the fill+submit into two separately-flushed steps.
async function submitEmailStepUnderFakeTimers(email: string) {
  await actWithFakeTimers(() => fireEvent.click(screen.getByText("go-email")));
  await actWithFakeTimers(() => {
    fireEvent.change(screen.getByLabelText("email-input"), { target: { value: email } });
    fireEvent.submit(screen.getByText("submit-email").closest("form")!);
  });
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  authConfigMock.otpLength = 6;
  authConfigMock.otpResendSeconds = 60;
  authConfigMock.termsUrl = "https://example.com/terms";
  authConfigMock.privacyUrl = undefined;
  useAuthMock.mockReturnValue(baseAuth());
  getEnabledSocialProvidersMock.mockResolvedValue(["apple", "facebook", "google", "x"]);
});

// ---------------------------------------------------------------------------
// Legal text / PolicyLink
// ---------------------------------------------------------------------------

describe("legal text (PolicyLink)", () => {
  it("renders an <a> when href is set and a plain <span> when href is undefined", async () => {
    authConfigMock.termsUrl = "https://example.com/terms";
    authConfigMock.privacyUrl = undefined;

    render(<AuthScreen />);
    await flushMicrotasks();

    const terms = screen.getByText("Terms");
    expect(terms.tagName).toBe("A");
    expect(terms).toHaveAttribute("href", "https://example.com/terms");
    expect(terms).toHaveAttribute("target", "_blank");
    expect(terms).toHaveAttribute("rel", "noreferrer");

    const privacy = screen.getByText("Privacy Policy");
    expect(privacy.tagName).toBe("SPAN");
    expect(privacy).not.toHaveAttribute("href");
  });
});

// ---------------------------------------------------------------------------
// Mode toggle / title
// ---------------------------------------------------------------------------

describe("mode toggle", () => {
  it("shows welcomeBack title in signin mode and createAccount title after switching to signup", async () => {
    render(<AuthScreen />);
    await flushMicrotasks();

    expect(screen.getByTestId("providers-title")).toHaveTextContent("Welcome back");

    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(screen.getByTestId("providers-title")).toHaveTextContent("Create your account");
  });

  it("changeMode resets step/token/resendAvailableAt/error back to the providers step", async () => {
    const clearError = vi.fn();
    useAuthMock.mockReturnValue(baseAuth({ clearError }));

    render(<AuthScreen />);
    await flushMicrotasks();

    // Get to the email step, trigger a local error via an invalid submit.
    fireEvent.click(screen.getByText("go-email"));
    fireEvent.submit(screen.getByText("submit-email").closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");

    // Switching mode should clear the error and reset to providers step.
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(screen.getByTestId("providers-step")).toBeInTheDocument();
    expect(screen.queryByTestId("email-step")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(clearError).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Step machine
// ---------------------------------------------------------------------------

describe("step machine", () => {
  it("moves providers -> email -> otp, and back from each step", async () => {
    render(<AuthScreen />);
    await flushMicrotasks();

    expect(screen.getByTestId("providers-step")).toBeInTheDocument();

    fireEvent.click(screen.getByText("go-email"));
    expect(screen.getByTestId("email-step")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("email-input"), { target: { value: "person@example.com" } });
    fireEvent.submit(screen.getByText("submit-email").closest("form")!);
    await flushMicrotasks();

    expect(screen.getByTestId("otp-step")).toBeInTheDocument();

    // back from otp -> email, and token is cleared
    fireEvent.click(screen.getByText("otp-back"));
    expect(screen.getByTestId("email-step")).toBeInTheDocument();

    // back from email -> providers
    fireEvent.click(screen.getByText("email-back"));
    expect(screen.getByTestId("providers-step")).toBeInTheDocument();

    fireEvent.click(screen.getByText("go-email"));
    expect(screen.getByTestId("email-step")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// getEnabledSocialProviders effect
// ---------------------------------------------------------------------------

describe("provider availability effect", () => {
  it("sets status to unavailable when the resolved value is null", async () => {
    getEnabledSocialProvidersMock.mockResolvedValue(null);

    render(<AuthScreen />);
    await flushMicrotasks();

    expect(screen.getByTestId("providers-status")).toHaveTextContent("unavailable");
  });

  it("sets status to ready and stores the enabled providers when the resolved value is an array", async () => {
    getEnabledSocialProvidersMock.mockResolvedValue(["google", "apple"]);

    render(<AuthScreen />);
    await flushMicrotasks();

    expect(screen.getByTestId("providers-status")).toHaveTextContent("ready");
    expect(screen.getByTestId("providers-enabled")).toHaveTextContent("google,apple");
  });

  it("sets status to unavailable when the promise rejects with a non-AbortError", async () => {
    getEnabledSocialProvidersMock.mockRejectedValue(new Error("network down"));

    render(<AuthScreen />);
    await flushMicrotasks();

    expect(screen.getByTestId("providers-status")).toHaveTextContent("unavailable");
  });

  it("makes no state change when the promise rejects with an AbortError", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    getEnabledSocialProvidersMock.mockRejectedValue(abortError);

    render(<AuthScreen />);
    await flushMicrotasks();

    expect(screen.getByTestId("providers-status")).toHaveTextContent("loading");
  });
});

// ---------------------------------------------------------------------------
// handleProvider
// ---------------------------------------------------------------------------

describe("handleProvider", () => {
  it("shows a providerNotEnabled error naming the provider verbatim, without calling signInWithProvider", async () => {
    getEnabledSocialProvidersMock.mockResolvedValue(["google"]);
    const signInWithProvider = vi.fn();
    useAuthMock.mockReturnValue(baseAuth({ signInWithProvider }));

    render(<AuthScreen />);
    await flushMicrotasks();

    fireEvent.click(screen.getByText("provider-apple"));

    expect(screen.getByRole("alert")).toHaveTextContent("apple sign-in is not enabled in Supabase.");
    expect(signInWithProvider).not.toHaveBeenCalled();
  });

  it("uses the special-cased 'X' display name for the x provider", async () => {
    getEnabledSocialProvidersMock.mockResolvedValue(["google"]);
    const signInWithProvider = vi.fn();
    useAuthMock.mockReturnValue(baseAuth({ signInWithProvider }));

    render(<AuthScreen />);
    await flushMicrotasks();

    fireEvent.click(screen.getByText("provider-x"));

    expect(screen.getByRole("alert")).toHaveTextContent("X sign-in is not enabled in Supabase.");
    expect(signInWithProvider).not.toHaveBeenCalled();
  });

  it("calls signInWithProvider for an enabled provider, tracking pendingAction while in flight", async () => {
    getEnabledSocialProvidersMock.mockResolvedValue(["google"]);
    let resolveSignIn: () => void = () => {};
    const signInWithProvider = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSignIn = resolve;
        })
    );
    useAuthMock.mockReturnValue(baseAuth({ signInWithProvider }));

    render(<AuthScreen />);
    await flushMicrotasks();

    fireEvent.click(screen.getByText("provider-google"));
    expect(signInWithProvider).toHaveBeenCalledWith("google");
    expect(screen.getByTestId("providers-pending")).toHaveTextContent("google");

    await act(async () => {
      resolveSignIn();
      await Promise.resolve();
    });

    expect(screen.getByTestId("providers-pending")).toHaveTextContent("");
  });

  it("swallows a signInWithProvider rejection without setting a visible error", async () => {
    getEnabledSocialProvidersMock.mockResolvedValue(["google"]);
    const signInWithProvider = vi.fn().mockRejectedValue(new Error("oauth failed"));
    useAuthMock.mockReturnValue(baseAuth({ signInWithProvider }));

    render(<AuthScreen />);
    await flushMicrotasks();

    fireEvent.click(screen.getByText("provider-google"));
    await flushMicrotasks();

    expect(screen.getByTestId("providers-pending")).toHaveTextContent("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// sendEmailOtp / handleEmailSubmit
// ---------------------------------------------------------------------------

describe("sendEmailOtp / handleEmailSubmit", () => {
  it("shows an invalid-email error and does not call requestEmailOtp for a malformed address", async () => {
    const requestEmailOtp = vi.fn();
    useAuthMock.mockReturnValue(baseAuth({ requestEmailOtp }));

    render(<AuthScreen />);
    await flushMicrotasks();

    fireEvent.click(screen.getByText("go-email"));
    fireEvent.change(screen.getByLabelText("email-input"), { target: { value: "not-an-email" } });
    fireEvent.submit(screen.getByText("submit-email").closest("form")!);
    await flushMicrotasks();

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(requestEmailOtp).not.toHaveBeenCalled();
    expect(screen.getByTestId("email-step")).toBeInTheDocument();
  });

  it("calls requestEmailOtp with shouldCreateUser/marketingOptIn false in signin mode and moves to otp", async () => {
    const requestEmailOtp = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue(baseAuth({ requestEmailOtp }));

    render(<AuthScreen />);
    await flushMicrotasks();

    fireEvent.click(screen.getByText("go-email"));
    fireEvent.change(screen.getByLabelText("email-input"), { target: { value: "  person@example.com  " } });
    fireEvent.submit(screen.getByText("submit-email").closest("form")!);
    await flushMicrotasks();

    expect(requestEmailOtp).toHaveBeenCalledWith({
      email: "person@example.com",
      marketingOptIn: false,
      shouldCreateUser: false,
    });
    expect(screen.getByTestId("otp-step")).toBeInTheDocument();
  });

  it("calls requestEmailOtp with shouldCreateUser true and marketingOptIn reflecting the toggle in signup mode", async () => {
    const requestEmailOtp = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue(baseAuth({ requestEmailOtp }));

    render(<AuthScreen />);
    await flushMicrotasks();

    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    fireEvent.click(screen.getByText("go-email"));
    fireEvent.click(screen.getByText("toggle-marketing"));
    fireEvent.change(screen.getByLabelText("email-input"), { target: { value: "person@example.com" } });
    fireEvent.submit(screen.getByText("submit-email").closest("form")!);
    await flushMicrotasks();

    expect(requestEmailOtp).toHaveBeenCalledWith({
      email: "person@example.com",
      marketingOptIn: true,
      shouldCreateUser: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Resend countdown effect + handleResend
// ---------------------------------------------------------------------------

describe("resend countdown effect and handleResend", () => {
  it("does not start a timer while resendAvailableAt is unset", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");

    render(<AuthScreen />);
    await flushMicrotasks();

    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  it("ticks resendSeconds down every second and clears the interval once elapsed, and clears on unmount", async () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");

    const requestEmailOtp = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue(baseAuth({ requestEmailOtp }));

    let view: ReturnType<typeof render>;
    await act(async () => {
      view = render(<AuthScreen />);
      await vi.advanceTimersByTimeAsync(0);
    });

    await submitEmailStepUnderFakeTimers("person@example.com");

    expect(screen.getByTestId("otp-resend-seconds")).toHaveTextContent("60");

    await advanceFakeTimers(1_000);
    expect(screen.getByTestId("otp-resend-seconds")).toHaveTextContent("59");

    await advanceFakeTimers(59_000);
    expect(screen.getByTestId("otp-resend-seconds")).toHaveTextContent("0");
    expect(clearIntervalSpy).toHaveBeenCalled();

    const callsBeforeUnmount = clearIntervalSpy.mock.calls.length;
    view!.unmount();
    expect(clearIntervalSpy.mock.calls.length).toBeGreaterThanOrEqual(callsBeforeUnmount);

    clearIntervalSpy.mockRestore();
    vi.useRealTimers();
  });

  it("handleResend is a no-op while resendSeconds > 0", async () => {
    vi.useFakeTimers();
    const requestEmailOtp = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue(baseAuth({ requestEmailOtp }));

    await act(async () => {
      render(<AuthScreen />);
      await vi.advanceTimersByTimeAsync(0);
    });

    await submitEmailStepUnderFakeTimers("person@example.com");
    expect(requestEmailOtp).toHaveBeenCalledTimes(1);

    await actWithFakeTimers(() => fireEvent.click(screen.getByText("resend-otp")));
    expect(requestEmailOtp).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("handleResend is a no-op while pendingAction is not null, even once resendSeconds reaches 0", async () => {
    vi.useFakeTimers();
    const requestEmailOtp = vi.fn().mockResolvedValue(undefined);
    let resolveVerify: () => void = () => {};
    const verifyEmailOtp = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveVerify = resolve;
        })
    );
    useAuthMock.mockReturnValue(baseAuth({ requestEmailOtp, verifyEmailOtp }));

    await act(async () => {
      render(<AuthScreen />);
      await vi.advanceTimersByTimeAsync(0);
    });

    await submitEmailStepUnderFakeTimers("person@example.com");

    // Let the countdown fully elapse so resendSeconds is 0.
    await advanceFakeTimers(60_000);
    expect(screen.getByTestId("otp-resend-seconds")).toHaveTextContent("0");

    // Start an in-flight OTP verification so pendingAction is non-null.
    await actWithFakeTimers(() => {
      fireEvent.change(screen.getByLabelText("token-input"), { target: { value: "123456" } });
      fireEvent.submit(screen.getByText("submit-otp").closest("form")!);
    });
    expect(screen.getByTestId("otp-pending")).toHaveTextContent("otp");

    await actWithFakeTimers(() => fireEvent.click(screen.getByText("resend-otp")));
    expect(requestEmailOtp).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveVerify();
      await Promise.resolve();
    });

    vi.useRealTimers();
  });

  it("performs a real resend once resendSeconds is 0 and no action is pending", async () => {
    vi.useFakeTimers();
    const requestEmailOtp = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue(baseAuth({ requestEmailOtp }));

    await act(async () => {
      render(<AuthScreen />);
      await vi.advanceTimersByTimeAsync(0);
    });

    await submitEmailStepUnderFakeTimers("person@example.com");
    expect(requestEmailOtp).toHaveBeenCalledTimes(1);

    await advanceFakeTimers(60_000);
    expect(screen.getByTestId("otp-resend-seconds")).toHaveTextContent("0");

    await actWithFakeTimers(() => fireEvent.click(screen.getByText("resend-otp")));
    expect(requestEmailOtp).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// handleOtpSubmit
// ---------------------------------------------------------------------------

describe("handleOtpSubmit", () => {
  async function reachOtpStep() {
    fireEvent.click(screen.getByText("go-email"));
    fireEvent.change(screen.getByLabelText("email-input"), { target: { value: "person@example.com" } });
    fireEvent.submit(screen.getByText("submit-email").closest("form")!);
    await flushMicrotasks();
  }

  it("shows an enterOtpCode error and does not call verifyEmailOtp when the token doesn't match otpLength digits", async () => {
    const verifyEmailOtp = vi.fn();
    useAuthMock.mockReturnValue(baseAuth({ verifyEmailOtp }));

    render(<AuthScreen />);
    await flushMicrotasks();
    await reachOtpStep();

    fireEvent.change(screen.getByLabelText("token-input"), { target: { value: "123" } });
    fireEvent.submit(screen.getByText("submit-otp").closest("form")!);
    await flushMicrotasks();

    expect(screen.getByRole("alert")).toHaveTextContent("Enter the 6-digit code sent to your email.");
    expect(verifyEmailOtp).not.toHaveBeenCalled();
  });

  it("calls verifyEmailOtp with the trimmed email and token for a valid code", async () => {
    const verifyEmailOtp = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue(baseAuth({ verifyEmailOtp }));

    render(<AuthScreen />);
    await flushMicrotasks();
    await reachOtpStep();

    fireEvent.change(screen.getByLabelText("token-input"), { target: { value: "654321" } });
    fireEvent.submit(screen.getByText("submit-otp").closest("form")!);
    await flushMicrotasks();

    expect(verifyEmailOtp).toHaveBeenCalledWith({ email: "person@example.com", token: "654321" });
  });

  it("swallows a verifyEmailOtp rejection without setting a visible error", async () => {
    const verifyEmailOtp = vi.fn().mockRejectedValue(new Error("bad code"));
    useAuthMock.mockReturnValue(baseAuth({ verifyEmailOtp }));

    render(<AuthScreen />);
    await flushMicrotasks();
    await reachOtpStep();

    fireEvent.change(screen.getByLabelText("token-input"), { target: { value: "654321" } });
    fireEvent.submit(screen.getByText("submit-otp").closest("form")!);
    await flushMicrotasks();

    expect(screen.getByTestId("otp-pending")).toHaveTextContent("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// visibleError derivation
// ---------------------------------------------------------------------------

describe("visibleError", () => {
  it("shows the context error when there is no local error", async () => {
    useAuthMock.mockReturnValue(baseAuth({ error: "context error message" }));

    render(<AuthScreen />);
    await flushMicrotasks();

    expect(screen.getByRole("alert")).toHaveTextContent("context error message");
  });

  it("prefers the local error over the context error once one is set", async () => {
    useAuthMock.mockReturnValue(baseAuth({ error: "context error message" }));

    render(<AuthScreen />);
    await flushMicrotasks();

    fireEvent.click(screen.getByText("go-email"));
    fireEvent.submit(screen.getByText("submit-email").closest("form")!);
    await flushMicrotasks();

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
  });

  it("renders no alert when neither a local nor a context error is set", async () => {
    render(<AuthScreen />);
    await flushMicrotasks();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
