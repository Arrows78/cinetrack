import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/states/empty-state'

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page introuvable"
      description="La route demandée n’existe pas ou n’a pas encore été exposée dans le router."
      action={
        <Button asChild>
          <Link to="/">Retour à l’accueil</Link>
        </Button>
      }
    />
  )
}
