import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterBar } from '@/components/media/filter-bar';
import { SectionHeader } from '@/components/media/section-header';
import { usePreferences } from '@/hooks/use-local-media';

export function SettingsPage() {
  const { data: preferences, updatePreference, isSaving } = usePreferences();

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Paramètres"
        subtitle="Préférences utilisateur persistées localement, desktop first, prêtes pour un futur port mobile."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Préférences UI</CardTitle>
            <CardDescription>Personnalise l’expérience locale.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="mb-3 text-sm font-medium">Type de recherche par défaut</p>
              <FilterBar
                value={preferences?.defaultSearchType ?? 'all'}
                onChange={(value) => updatePreference({ key: 'defaultSearchType', value })}
                options={[
                  { value: 'all', label: 'Tout' },
                  { value: 'movie', label: 'Films' },
                  { value: 'series', label: 'Séries' },
                ]}
              />
            </div>

            <div>
              <p className="mb-3 text-sm font-medium">Filtre watchlist par défaut</p>
              <FilterBar
                value={preferences?.defaultWatchlistFilter ?? 'all'}
                onChange={(value) => updatePreference({ key: 'defaultWatchlistFilter', value })}
                options={[
                  { value: 'all', label: 'Tout' },
                  { value: 'movie', label: 'Films' },
                  { value: 'series', label: 'Séries' },
                ]}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant={preferences?.reduceMotion ? 'secondary' : 'outline'}
                disabled={isSaving}
                onClick={() =>
                  updatePreference({ key: 'reduceMotion', value: !preferences?.reduceMotion })
                }
              >
                {preferences?.reduceMotion ? 'Animations réduites activées' : 'Réduire les animations'}
              </Button>
              <Button
                variant={preferences?.compactMode ? 'secondary' : 'outline'}
                disabled={isSaving}
                onClick={() => updatePreference({ key: 'compactMode', value: !preferences?.compactMode })}
              >
                {preferences?.compactMode ? 'Mode compact activé' : 'Activer le mode compact'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuration API</CardTitle>
            <CardDescription>
              L’application utilise TMDB via une couche provider abstraite.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Renseigne un bearer token TMDB dans <code className="rounded bg-white/10 px-2 py-1">.env</code> :
            </p>
            <pre className="overflow-x-auto rounded-3xl border border-white/10 bg-background/60 p-4 text-xs text-foreground">
VITE_TMDB_API_TOKEN=your_tmdb_bearer_token_here
            </pre>
            <Button asChild variant="outline">
              <a href="https://developer.themoviedb.org/docs/getting-started" target="_blank" rel="noreferrer">
                Ouvrir la doc TMDB
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
