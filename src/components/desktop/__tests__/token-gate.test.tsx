import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { UserFacingError } from "@/shared/lib/user-facing-error";
import { TokenGate } from "../token-gate";

const isTauriAppMock = vi.fn(() => false);
vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => isTauriAppMock() }));

const useTokenVaultMock = vi.fn(() => ({ unlocked: false, configured: false, source: null as string | null }));
vi.mock("@/features/desktop/use-token-vault", () => ({ useTokenVault: () => useTokenVaultMock() }));

const initializeMock = vi.fn();
const saveMock = vi.fn();
const unlockMock = vi.fn();
vi.mock("@/features/desktop/token-vault", () => ({
  tokenVault: {
    initialize: (...args: unknown[]) => initializeMock(...args),
    save: (...args: unknown[]) => saveMock(...args),
    unlock: (...args: unknown[]) => unlockMock(...args),
  },
}));

const loggerWarnMock = vi.fn();
vi.mock("@/features/diagnostics/logger", () => ({
  logger: { info: vi.fn(), warn: (...args: unknown[]) => loggerWarnMock(...args), error: vi.fn() },
}));

function passwordInput() {
  return screen.getByLabelText("Vault password") as HTMLInputElement;
}

function bearerInput() {
  return screen.getByLabelText("TMDB Bearer token") as HTMLTextAreaElement;
}

describe("TokenGate", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    isTauriAppMock.mockReset().mockReturnValue(false);
    useTokenVaultMock.mockReset().mockReturnValue({ unlocked: false, configured: false, source: null });
    initializeMock.mockReset().mockResolvedValue(undefined);
    saveMock.mockReset().mockResolvedValue(undefined);
    unlockMock.mockReset().mockResolvedValue(true);
    loggerWarnMock.mockReset();
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
  });

  it("renders children directly when unlocked and configured", () => {
    useTokenVaultMock.mockReturnValue({ unlocked: true, configured: true, source: "vault" });

    render(
      <TokenGate>
        <div>Protected content</div>
      </TokenGate>
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.queryByText("Connect CineTrack to TMDB")).not.toBeInTheDocument();
  });

  it("calls tokenVault.initialize() on mount even when children are passed through", () => {
    useTokenVaultMock.mockReturnValue({ unlocked: true, configured: true, source: "vault" });

    render(
      <TokenGate>
        <div>Protected content</div>
      </TokenGate>
    );

    expect(initializeMock).toHaveBeenCalledTimes(1);
  });

  it("renders the gated form when unlocked is false", () => {
    useTokenVaultMock.mockReturnValue({ unlocked: false, configured: false, source: null });

    render(
      <TokenGate>
        <div>Protected content</div>
      </TokenGate>
    );

    expect(screen.getByText("Connect CineTrack to TMDB")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders the gated form when unlocked is true but not configured", () => {
    useTokenVaultMock.mockReturnValue({ unlocked: true, configured: false, source: null });

    render(
      <TokenGate>
        <div>Protected content</div>
      </TokenGate>
    );

    expect(screen.getByText("Connect CineTrack to TMDB")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders the password field when running inside Tauri", () => {
    isTauriAppMock.mockReturnValue(true);

    render(<TokenGate>child</TokenGate>);

    expect(screen.getByLabelText("Vault password")).toBeInTheDocument();
  });

  it("does not render the password field outside Tauri", () => {
    isTauriAppMock.mockReturnValue(false);

    render(<TokenGate>child</TokenGate>);

    expect(screen.queryByLabelText("Vault password")).not.toBeInTheDocument();
  });

  it("disables submit when inside Tauri and the password is empty", () => {
    isTauriAppMock.mockReturnValue(true);

    render(<TokenGate>child</TokenGate>);

    expect(screen.getByRole("button", { name: "Unlock" })).toBeDisabled();
  });

  it("enables submit when inside Tauri and the password is filled", () => {
    isTauriAppMock.mockReturnValue(true);

    render(<TokenGate>child</TokenGate>);
    fireEvent.change(passwordInput(), { target: { value: "hunter2" } });

    expect(screen.getByRole("button", { name: "Unlock" })).not.toBeDisabled();
  });

  it("enables submit outside Tauri even when the password is empty", () => {
    isTauriAppMock.mockReturnValue(false);

    render(<TokenGate>child</TokenGate>);

    expect(screen.getByRole("button", { name: "Unlock" })).not.toBeDisabled();
  });

  it("shows the 'unlock' label when the bearer field is empty", () => {
    render(<TokenGate>child</TokenGate>);

    expect(screen.getByRole("button", { name: "Unlock" })).toBeInTheDocument();
  });

  it("shows the 'save and open' label once a bearer token is typed", () => {
    render(<TokenGate>child</TokenGate>);
    fireEvent.change(bearerInput(), { target: { value: "my-bearer" } });

    expect(screen.getByRole("button", { name: "Save and open" })).toBeInTheDocument();
  });

  it("submits with a bearer token: calls save (not unlock) and reloads outside Tauri", async () => {
    isTauriAppMock.mockReturnValue(false);

    render(<TokenGate>child</TokenGate>);
    fireEvent.change(bearerInput(), { target: { value: "my-bearer" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and open" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledWith("", "my-bearer"));
    expect(unlockMock).not.toHaveBeenCalled();
    await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1));
  });

  it("skips reload when inside Tauri even after a successful save with a bearer token", async () => {
    isTauriAppMock.mockReturnValue(true);

    render(<TokenGate>child</TokenGate>);
    fireEvent.change(passwordInput(), { target: { value: "hunter2" } });
    fireEvent.change(bearerInput(), { target: { value: "my-bearer" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and open" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledWith("hunter2", "my-bearer"));
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it("submits with an empty bearer field: calls unlock (not save)", async () => {
    isTauriAppMock.mockReturnValue(false);
    unlockMock.mockResolvedValue(true);

    render(<TokenGate>child</TokenGate>);
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => expect(unlockMock).toHaveBeenCalledWith(""));
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only bearer field as empty and calls unlock", async () => {
    isTauriAppMock.mockReturnValue(false);
    unlockMock.mockResolvedValue(true);

    render(<TokenGate>child</TokenGate>);
    fireEvent.change(bearerInput(), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => expect(unlockMock).toHaveBeenCalledWith(""));
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("skips reload when unlocking outside Tauri (bearer stays empty)", async () => {
    isTauriAppMock.mockReturnValue(false);
    unlockMock.mockResolvedValue(true);

    render(<TokenGate>child</TokenGate>);
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => expect(unlockMock).toHaveBeenCalledTimes(1));
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it("shows the noToken message when unlock() resolves false", async () => {
    isTauriAppMock.mockReturnValue(false);
    unlockMock.mockResolvedValue(false);

    render(<TokenGate>child</TokenGate>);
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByText("No token is registered in this vault yet.")).toBeInTheDocument();
  });

  it("shows no message when unlock() resolves true", async () => {
    isTauriAppMock.mockReturnValue(false);
    unlockMock.mockResolvedValue(true);

    render(<TokenGate>child</TokenGate>);
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => expect(unlockMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("No token is registered in this vault yet.")).not.toBeInTheDocument();
  });

  it("does not render a message paragraph before any submission", () => {
    render(<TokenGate>child</TokenGate>);

    expect(screen.queryByText("No token is registered in this vault yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Cannot open the vault.")).not.toBeInTheDocument();
  });

  it("on save() rejecting: logs a warning and shows the translated fallback message, never reloads", async () => {
    isTauriAppMock.mockReturnValue(false);
    saveMock.mockRejectedValue(new Error("raw backend detail"));

    render(<TokenGate>child</TokenGate>);
    fireEvent.change(bearerInput(), { target: { value: "my-bearer" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and open" }));

    await waitFor(() => expect(loggerWarnMock).toHaveBeenCalledTimes(1));
    expect(loggerWarnMock.mock.calls[0]?.[0]).toContain("raw backend detail");
    expect(await screen.findByText("Cannot open the vault.")).toBeInTheDocument();
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it("on unlock() rejecting with a UserFacingError: shows the error's own message instead of the fallback", async () => {
    isTauriAppMock.mockReturnValue(false);
    unlockMock.mockRejectedValue(new UserFacingError("Custom vault error"));

    render(<TokenGate>child</TokenGate>);
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByText("Custom vault error")).toBeInTheDocument();
    await waitFor(() => expect(loggerWarnMock).toHaveBeenCalledTimes(1));
  });

  it("on a non-Error rejection: stringifies the thrown value for the log message", async () => {
    isTauriAppMock.mockReturnValue(false);
    unlockMock.mockRejectedValue("plain string failure");

    render(<TokenGate>child</TokenGate>);
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => expect(loggerWarnMock).toHaveBeenCalledTimes(1));
    expect(loggerWarnMock.mock.calls[0]?.[0]).toContain("plain string failure");
    expect(await screen.findByText("Cannot open the vault.")).toBeInTheDocument();
  });

  it("disables the submit button while a submission is in flight, then re-enables it", async () => {
    isTauriAppMock.mockReturnValue(false);
    let resolveSave!: () => void;
    saveMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );

    render(<TokenGate>child</TokenGate>);
    fireEvent.change(bearerInput(), { target: { value: "my-bearer" } });
    const button = screen.getByRole("button", { name: "Save and open" });
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());

    resolveSave();

    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
