import type { KeyboardEvent, ReactNode, Ref } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchBar({
  value,
  onChange,
  placeholder,
  onFocus,
  onBlur,
  onKeyDown,
  inputRef,
  dropdownOpen,
  dropdownId,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: Ref<HTMLInputElement>;
  /** Whether `children` (a dropdown) is currently shown — only meaningful together with `children`. */
  dropdownOpen?: boolean;
  /** Id of the `children` dropdown element, wired to the input's `aria-controls`. */
  dropdownId?: string;
  /** An autocomplete dropdown rendered under the input — omit for a plain search field. */
  children?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? t("searchBar.placeholder")}
        aria-label={placeholder ?? t("searchBar.placeholder")}
        role={children ? "combobox" : undefined}
        aria-expanded={children ? Boolean(dropdownOpen) : undefined}
        aria-controls={children ? dropdownId : undefined}
        aria-autocomplete={children ? "list" : undefined}
        className="pl-11"
      />
      {children}
    </div>
  );
}
