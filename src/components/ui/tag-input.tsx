import { useId, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/shared/lib/cn";

/**
 * Chip-based tag editor with an autocomplete dropdown over `suggestions`
 * (see useLibraryDistinctTags) — the free-text, comma-separated field this
 * replaces was the only way to add a tag already used elsewhere, so a typo
 * or a casing slip ("Action" vs "action") silently created a near-duplicate.
 * Typing something not in `suggestions` still creates a brand new tag on
 * Enter/comma — this narrows accidental duplicates, it doesn't restrict tags
 * to a fixed vocabulary.
 */
export function TagInput({
  value,
  onChange,
  suggestions,
  placeholder,
  ariaLabel,
  disabled = false,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const listboxId = useId();

  const normalizedValue = new Set(value.map((tag) => tag.toLowerCase()));
  const query = draft.trim().toLowerCase();
  const matches = query
    ? suggestions
        .filter((tag) => !normalizedValue.has(tag.toLowerCase()) && tag.toLowerCase().includes(query))
        .slice(0, 6)
    : [];

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    setDraft("");
    setOpen(false);
    setHighlighted(0);
    if (!trimmed || normalizedValue.has(trimmed.toLowerCase())) return;
    onChange([...value, trimmed]);
  };

  // Handles a paste like "family, sci-fi, sunday" in one go — the
  // comma-separated field this replaces supported that, so committing the
  // draft still splits on commas rather than adding it as one long tag.
  const commitDraft = () => {
    const seen = new Set(normalizedValue);
    const additions: string[] = [];
    for (const part of draft.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      additions.push(trimmed);
    }
    setDraft("");
    setOpen(false);
    setHighlighted(0);
    if (additions.length) onChange([...value, ...additions]);
  };

  const removeTag = (tag: string) => onChange(value.filter((existing) => existing !== tag));

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (open && matches[highlighted]) addTag(matches[highlighted]);
      else commitDraft();
    } else if (event.key === "Backspace" && !draft && value.length > 0) {
      removeTag(value[value.length - 1]!);
    } else if (event.key === "ArrowDown" && matches.length) {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % matches.length);
    } else if (event.key === "ArrowUp" && matches.length) {
      event.preventDefault();
      setHighlighted((current) => (current - 1 + matches.length) % matches.length);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 py-1.5",
          "focus-within:ring-2 focus-within:ring-ring",
          disabled ? "opacity-50" : "cursor-text"
        )}
      >
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 py-1 pr-1">
            {tag}
            {disabled ? null : (
              <button
                type="button"
                aria-label={t("library.removeTag", { tag })}
                onClick={(event) => {
                  event.stopPropagation();
                  removeTag(tag);
                }}
                className="rounded-full p-0.5 hover:bg-foreground/10"
              >
                <X className="size-3" />
              </button>
            )}
          </Badge>
        ))}
        <input
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          disabled={disabled}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
            setHighlighted(0);
          }}
          onFocus={() => setOpen(true)}
          // Deferred so a suggestion's onClick (fired on mousedown-then-click)
          // still lands before the list unmounts; commits whatever's left
          // typed too, so tabbing away doesn't silently drop it.
          onBlur={() => setTimeout(commitDraft, 100)}
          onKeyDown={handleKeyDown}
          placeholder={value.length ? undefined : placeholder}
          className="min-w-24 flex-1 bg-transparent text-body-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open && matches.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-dropdown mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-elevation-lg"
        >
          {matches.map((tag, index) => (
            <li key={tag} role="option" aria-selected={index === highlighted}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addTag(tag)}
                className={cn(
                  "block w-full rounded-md px-3 py-1.5 text-left text-body-sm",
                  index === highlighted ? "bg-accent/15" : "hover:bg-accent/10"
                )}
              >
                {tag}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
