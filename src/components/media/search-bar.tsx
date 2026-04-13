import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export function SearchBar({
  value,
  onChange,
  placeholder = 'Rechercher un film ou une série…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="pl-11"
      />
    </div>
  );
}
