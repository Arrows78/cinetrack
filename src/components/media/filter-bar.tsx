import { Button } from '@/components/ui/button';
import { cn } from '@/shared/lib/cn';

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
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.value}
          variant="ghost"
          size="sm"
          onClick={() => onChange(option.value)}
          className={cn('rounded-full border border-white/10', value === option.value && 'bg-primary/15 text-primary')}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
