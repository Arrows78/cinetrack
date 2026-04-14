import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SeenToggle({
  seen,
  onToggle,
  labelSeen,
  labelUnseen,
  disabled,
}: {
  seen: boolean
  onToggle: () => void
  labelSeen?: string
  labelUnseen?: string
  disabled?: boolean
}) {
  const { t } = useTranslation()

  return (
    <Button variant={seen ? 'secondary' : 'outline'} onClick={onToggle} disabled={disabled}>
      {seen ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
      {seen ? (labelSeen ?? t('media.seen')) : (labelUnseen ?? t('media.markAsSeen'))}
    </Button>
  )
}
