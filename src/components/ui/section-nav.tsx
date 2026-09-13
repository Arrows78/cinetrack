import { useActiveSection } from "@/hooks/use-active-section";
import { cn } from "@/shared/lib/cn";

export interface SectionNavItem {
  id: string;
  label: string;
}

/**
 * Sticky pill-style jump nav for a long page broken into `id`-anchored
 * sections (see design-system-page.tsx and home-page.tsx). Hides itself
 * below two items — a nav that can only ever point at the section you're
 * already looking at isn't worth the chrome.
 */
export function SectionNav({
  items,
  ariaLabel,
  className,
}: {
  items: readonly SectionNavItem[];
  ariaLabel: string;
  className?: string;
}) {
  const activeSection = useActiveSection(items.map((item) => item.id));

  if (items.length < 2) return null;

  return (
    <nav
      className={cn(
        "sticky top-20 z-sticky -mx-4 flex gap-1 overflow-x-auto border-y border-border bg-background/90 px-4 py-2 backdrop-blur-md lg:top-0 lg:-mx-6 lg:px-6",
        className
      )}
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          aria-current={activeSection === item.id ? "location" : undefined}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeSection === item.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          )}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
