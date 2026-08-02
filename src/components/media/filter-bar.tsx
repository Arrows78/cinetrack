import { cn } from "@/shared/lib/cn";

export function FilterBar<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-2xl bg-foreground/[0.06] p-1 gap-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-xl px-4 py-1.5 text-sm font-medium transition-all duration-fast",
            value === option.value
              ? "bg-black/10 dark:bg-white/10 text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground/80"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
