import { expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

// Recent Node.js versions ship an experimental global `localStorage` that
// conflicts with jsdom's own per-window implementation, leaving
// `window.localStorage` undefined in tests. Install a minimal spec-compliant
// polyfill so repository fallback code (which relies on real localStorage
// semantics) behaves the same under test as it does in a browser/WebView.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

if (typeof window !== "undefined" && !window.localStorage) {
  Object.defineProperty(window, "localStorage", {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
}

// jsdom doesn't implement matchMedia at all — anything that reads it
// (useIsTouchDevice, prefers-reduced-motion checks) would otherwise throw
// under test. Defaults to "no match" (mouse/keyboard, no reduced motion),
// matching a typical CI/dev environment; tests that need a specific query
// to match override this per-call.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
    writable: true,
    configurable: true,
  });
}
