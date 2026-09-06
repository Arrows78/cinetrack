import { cn } from "@/shared/lib/cn";

export function FilterBar<T extends string>({
  value,
  options,
  onChange,
  groupLabel,
  as = "filter",
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  // Required, not optional: without it a screen reader falls back to the
  // same generic "Filter" label for every group on the page, so two filter
  // bars on one page (e.g. type + sort) become indistinguishable. Making
  // this required means a missing label is a compile error, not a silent
  // accessibility gap found later by audit.
  groupLabel: string;
  // "tabs": same look, but this bar switches between whole content panels
  // rather than narrowing a list (e.g. Series/Movies' "My list" vs
  // "Upcoming") — role="tablist"/"tab" + aria-selected is the correct
  // semantics there, not role="group"/aria-pressed, which describes a set
  // of independent toggles rather than one mutually-exclusive view.
  as?: "filter" | "tabs";
}) {
  const isTabs = as === "tabs";
  return (
    <div
      role={isTabs ? "tablist" : "group"}
      aria-label={groupLabel}
      className="flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-2xl bg-foreground/[0.06] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role={isTabs ? "tab" : undefined}
            aria-selected={isTabs ? selected : undefined}
            aria-pressed={isTabs ? undefined : selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "shrink-0 rounded-xl px-4 py-1.5 text-sm font-medium transition-all duration-fast",
              selected ? "bg-foreground/10 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/80"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
