import { Progress } from '@/components/ui/progress'

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="space-y-2">
      {label ? <div className="text-sm text-muted-foreground">{label}</div> : null}
      <Progress value={value} />
    </div>
  )
}
