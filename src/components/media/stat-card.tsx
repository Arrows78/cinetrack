export function StatCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-l-2 border-primary pl-4">
      <p className="text-overline font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="font-display text-3xl font-bold leading-none text-primary">{value}</p>
      {helper ? <p className="mt-1 text-caption text-muted-foreground">{helper}</p> : null}
    </div>
  );
}
