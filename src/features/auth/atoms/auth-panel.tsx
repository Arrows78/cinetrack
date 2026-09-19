import type { PropsWithChildren } from "react";

import { AuthBrandMark } from "@/features/auth/atoms/auth-brand-mark";

export function AuthPanel({ children }: PropsWithChildren) {
  return (
    <div className="relative z-10 order-2 flex shrink-0 flex-col justify-start border-t border-auth-foreground/10 bg-auth-surface px-6 py-10 sm:px-10 lg:min-h-screen lg:w-[28rem] lg:flex-none lg:justify-center lg:border-l lg:border-t-0 xl:w-[30rem]">
      <div className="mx-auto flex w-full max-w-[22rem] flex-col">
        <div className="mb-8">
          <AuthBrandMark />
        </div>
        {children}
      </div>
    </div>
  );
}
