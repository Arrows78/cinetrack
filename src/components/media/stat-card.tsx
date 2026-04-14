import { Card } from '@/components/ui/card'

export function StatCard({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper?: string
}) {
  return (
    <Card className="rounded-[28px]">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {helper ? <p className="mt-2 text-sm text-muted-foreground">{helper}</p> : null}
    </Card>
  )
}
