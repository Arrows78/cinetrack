import type * as React from 'react'
import { cn } from '@/shared/lib/cn'

interface EmptyStateProps {
  title: string
  description: string
  action?: React.ReactNode
  icon?: React.ElementType
  className?: string
}

export function EmptyState({ title, description, action, icon: Icon, className }: EmptyStateProps) {
  return (
    <div className={cn('surface rounded-[32px] px-6 py-12 text-center', className)}>
      {Icon && (
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-8 w-8" />
        </div>
      )}
      <p className="text-2xl font-semibold">{title}</p>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">{description}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  )
}
