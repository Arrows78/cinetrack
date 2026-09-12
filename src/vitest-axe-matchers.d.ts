// jest-axe (see test-setup.ts's expect.extend(toHaveNoViolations)) only ships
// type augmentations for Jest's own `Matchers` interface (@types/jest-axe),
// never for Vitest's `Assertion` — unlike @testing-library/jest-dom, which
// ships its own `vitest.d.ts` augmentation for exactly this purpose. Filename
// deliberately doesn't share a basename with test-setup.ts: TS treats a
// `<name>.d.ts` next to a same-named `<name>.ts` as that file's own (ignored)
// declaration output, not a separate ambient file, so it never gets picked up.
import "vitest";

interface AxeMatchers<T = unknown> {
  toHaveNoViolations(): T;
}

declare module "vitest" {
  // Both interfaces necessarily have an empty body — declaration merging via
  // `extends` is the only way to add a member to an interface from outside
  // its own module. `T` is required to match Assertion's real arity (2 type
  // parameters) even though only `R` is used here.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Assertion<R extends void | Promise<void> = void, T = unknown> extends AxeMatchers<R> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
