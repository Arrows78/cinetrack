import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import i18n from "@/i18n";
import { AccountSettingsCard } from "../account-settings-card";

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

const loggerWarnMock = vi.fn();
const loggerErrorMock = vi.fn();
vi.mock("@/shared/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: (...args: unknown[]) => loggerWarnMock(...args),
    error: (...args: unknown[]) => loggerErrorMock(...args),
  },
}));

const signOutMock = vi.fn();
vi.mock("@/features/auth/use-auth", () => ({
  useAuth: () => ({ signOut: (...args: unknown[]) => signOutMock(...args) }),
}));

const createEmailAddressMock = vi.fn();
const prepareVerificationMock = vi.fn();
const attemptVerificationMock = vi.fn();
const destroyMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();

let currentUser: Record<string, unknown> | null;

vi.mock("@clerk/react", () => ({ useUser: () => ({ user: currentUser }) }));

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user-1",
    primaryEmailAddressId: "email-1",
    primaryEmailAddress: { emailAddress: "old@example.com" },
    emailAddresses: [{ id: "email-1", emailAddress: "old@example.com", destroy: destroyMock }],
    deleteSelfEnabled: true,
    createEmailAddress: createEmailAddressMock,
    update: updateMock,
    delete: deleteMock,
    ...overrides,
  };
}

function renderCard() {
  return render(<AccountSettingsCard />);
}

describe("AccountSettingsCard", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    toastMock.mockReset();
    loggerWarnMock.mockReset();
    loggerErrorMock.mockReset();
    signOutMock.mockReset().mockResolvedValue(undefined);
    destroyMock.mockReset().mockResolvedValue(undefined);
    updateMock.mockReset().mockResolvedValue(undefined);
    deleteMock.mockReset().mockResolvedValue(undefined);
    createEmailAddressMock.mockReset();
    prepareVerificationMock.mockReset();
    attemptVerificationMock.mockReset();
    currentUser = makeUser();
  });

  it("renders nothing when there is no signed-in user", () => {
    currentUser = null;
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the current email address", () => {
    renderCard();
    expect(screen.getByText("Currently old@example.com.")).toBeInTheDocument();
  });

  it("hides the delete-account action when Clerk has self-deletion disabled", () => {
    currentUser = makeUser({ deleteSelfEnabled: false });
    renderCard();
    expect(screen.queryByRole("button", { name: "Delete my account" })).not.toBeInTheDocument();
  });

  it("walks through requesting and confirming an email change", async () => {
    const pendingEmail = {
      id: "email-2",
      emailAddress: "new@example.com",
      prepareVerification: prepareVerificationMock,
    };
    createEmailAddressMock.mockResolvedValue(pendingEmail);
    prepareVerificationMock.mockResolvedValue(pendingEmail);
    const verifiedEmail = { id: "email-2", attemptVerification: attemptVerificationMock };
    attemptVerificationMock.mockResolvedValue(verifiedEmail);
    currentUser = makeUser({
      emailAddresses: [
        { id: "email-1", emailAddress: "old@example.com", destroy: destroyMock },
        { id: "email-2", emailAddress: "new@example.com", attemptVerification: attemptVerificationMock },
      ],
    });

    renderCard();

    fireEvent.change(screen.getByLabelText("New email address"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));

    await waitFor(() => expect(createEmailAddressMock).toHaveBeenCalledWith({ email: "new@example.com" }));
    await waitFor(() => expect(prepareVerificationMock).toHaveBeenCalledWith({ strategy: "email_code" }));

    const codeInput = await screen.findByLabelText("Code sent to new@example.com");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(attemptVerificationMock).toHaveBeenCalledWith({ code: "123456" }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith({ primaryEmailAddressId: "email-2" }));
    await waitFor(() => expect(destroyMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        description: "Your email address has been updated.",
        variant: "success",
      })
    );
  });

  it("shows a translated error instead of the raw Clerk message when the code is wrong", async () => {
    const pendingEmail = {
      id: "email-2",
      emailAddress: "new@example.com",
      prepareVerification: prepareVerificationMock,
    };
    createEmailAddressMock.mockResolvedValue(pendingEmail);
    prepareVerificationMock.mockResolvedValue(pendingEmail);
    currentUser = makeUser({
      emailAddresses: [
        { id: "email-1", emailAddress: "old@example.com", destroy: destroyMock },
        { id: "email-2", emailAddress: "new@example.com", attemptVerification: attemptVerificationMock },
      ],
    });
    attemptVerificationMock.mockRejectedValue({
      errors: [{ code: "form_code_incorrect", message: "raw clerk detail" }],
    });

    renderCard();

    fireEvent.change(screen.getByLabelText("New email address"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));

    const codeInput = await screen.findByLabelText("Code sent to new@example.com");
    fireEvent.change(codeInput, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("That code is incorrect. Check it and try again.")).toBeInTheDocument();
    expect(screen.queryByText("raw clerk detail")).not.toBeInTheDocument();
  });

  it("deletes the account and signs out only after the confirm dialog is accepted", async () => {
    renderCard();

    expect(deleteMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete my account" }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
  });
});
