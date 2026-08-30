import type { LucideIcon } from "lucide-react";

export function AuthStepIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
      <Icon className="h-6 w-6" />
    </div>
  );
}
