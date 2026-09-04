import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";

export function FilterBar<T extends string>({
  value,
  options,
  onChange,
  groupLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  groupLabel?: string;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={groupLabel ?? t("filterBar.defaultLabel")}
      className="flex max-w-full gap-0.5 overflow-x-auto rounded-2xl bg-foreground/[0.06] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "shrink-0 rounded-xl px-4 py-1.5 text-sm font-medium transition-all duration-fast",
            value === option.value
              ? "bg-foreground/10 text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground/80"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
