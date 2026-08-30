import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export function AuthBackLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-7 inline-flex items-center gap-2 text-sm text-auth-foreground/60 hover:text-auth-foreground"
    >
      <ArrowLeft className="h-5 w-5" /> {children}
    </button>
  );
}
