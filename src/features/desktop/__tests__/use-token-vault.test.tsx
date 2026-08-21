import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { useTokenVault } from "../use-token-vault";
import { tokenVault } from "../token-vault";

type VaultSnapshot = {
  unlocked: boolean;
  configured: boolean;
  source: "env" | "vault" | "browser" | null;
};

const listeners = new Set<() => void>();
let snapshot: VaultSnapshot = { unlocked: false, configured: false, source: null };

const emit = (): void => {
  listeners.forEach((listener) => listener());
};

vi.mock("@/features/desktop/token-vault", () => ({
  tokenVault: {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    lock: () => {
      snapshot = { ...snapshot, unlocked: false };
      emit();
    },
  },
}));

function Probe() {
  const state = useTokenVault();
  return <div data-testid="probe">{JSON.stringify(state)}</div>;
}

describe("useTokenVault", () => {
  it("returns the vault's initial snapshot", () => {
    render(<Probe />);

    expect(screen.getByTestId("probe").textContent).toBe(JSON.stringify(tokenVault.getSnapshot()));
  });

  it("re-renders with the updated snapshot when the vault notifies subscribers", () => {
    snapshot = { unlocked: true, configured: true, source: "browser" };
    render(<Probe />);

    expect(screen.getByTestId("probe").textContent).toBe(
      JSON.stringify({ unlocked: true, configured: true, source: "browser" })
    );

    act(() => {
      tokenVault.lock();
    });

    expect(screen.getByTestId("probe").textContent).toBe(
      JSON.stringify({ unlocked: false, configured: true, source: "browser" })
    );
  });
});
