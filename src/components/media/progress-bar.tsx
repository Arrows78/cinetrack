import { cn } from '@/shared/lib/cn'

export function ProgressBar({
  value,
  label,
  showPercent = false,
  size = 'default',
  className,
}: {
  value: number
  label?: string
  showPercent?: boolean
  size?: 'sm' | 'default'
  className?: string
}) {
  const clampedValue = Math.min(100, Math.max(0, value))
  const isComplete = clampedValue >= 100

  return (
    <div className={cn('space-y-1.5', className)}>
      {(label || showPercent) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-xs text-muted-foreground">{label}</span>}
          {showPercent && (
            <span className={cn('text-xs font-semibold', isComplete ? 'text-primary' : 'text-muted-foreground')}>
              {clampedValue}%
            </span>
          )}
        </div>
      )}
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/[0.08]',
          size === 'sm' ? 'h-1' : 'h-1.5'
        )}
      >
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${clampedValue}%`,
            background: isComplete
              ? 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))'
              : 'linear-gradient(90deg, hsl(var(--primary)/0.9), hsl(var(--primary)))',
          }}
        />
      </div>
    </div>
  )
}
