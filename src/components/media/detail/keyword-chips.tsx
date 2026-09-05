// Same chip styling as MediaDetailsHero's genre chips, for visual
// consistency between the two thematic-tag lists a detail page shows.
export function KeywordChips({ keywords }: { keywords?: string[] }) {
  if (!keywords?.length) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      {keywords.map((keyword) => (
        <span
          key={keyword}
          className="rounded-full border border-border bg-foreground/5 px-2.5 py-0.5 text-xs text-muted-foreground"
        >
          {keyword}
        </span>
      ))}
    </div>
  );
}
