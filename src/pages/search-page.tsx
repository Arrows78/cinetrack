import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/states/empty-state';
import { GridSkeleton } from '@/components/states/loading-skeletons';
import { FilterBar } from '@/components/media/filter-bar';
import { MediaGrid } from '@/components/media/media-grid';
import { SearchBar } from '@/components/media/search-bar';
import { SectionHeader } from '@/components/media/section-header';
import { usePreferences } from '@/hooks/use-local-media';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useSearch } from '@/hooks/use-search';
import type { MediaSummary } from '@/types/media';

export function SearchPage() {
  const { data: preferences } = usePreferences();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'movie' | 'series'>(
    preferences?.defaultSearchType ?? 'all',
  );
  const debouncedQuery = useDebouncedValue(query, 350);
  const searchQuery = useSearch(debouncedQuery, scope);

  const grouped = useMemo(() => {
    const items = searchQuery.data ?? [];
    return {
      movies: items.filter((item) => item.mediaType === 'movie'),
      series: items.filter((item) => item.mediaType === 'series'),
    };
  }, [searchQuery.data]);

  return (
    <div className="space-y-8">
      <section className="surface rounded-[32px] p-6">
        <SectionHeader
          title="Recherche globale"
          subtitle="Débounce, états vides et filtres propres pour films et séries."
        />
        <div className="space-y-4">
          <SearchBar value={query} onChange={setQuery} />
          <FilterBar
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: 'Tout' },
              { value: 'movie', label: 'Films' },
              { value: 'series', label: 'Séries' },
            ]}
          />
        </div>
      </section>

      {searchQuery.isLoading ? <GridSkeleton count={8} /> : null}

      {debouncedQuery.trim().length < 2 ? (
        <EmptyState
          title="Commence à taper"
          description="La recherche s’active dès 2 caractères. Utilise le filtre pour cibler films, séries ou les deux."
        />
      ) : null}

      {debouncedQuery.trim().length >= 2 && !searchQuery.isLoading && !searchQuery.data?.length ? (
        <EmptyState
          title="Aucun résultat"
          description="Essaie un autre titre, une autre langue ou un filtre différent."
        />
      ) : null}

      {scope === 'all' && grouped.movies.length > 0 ? (
        <section>
          <SectionHeader title="Films" subtitle={`${grouped.movies.length} résultat(s)`} />
          <MediaGrid items={grouped.movies as MediaSummary[]} />
        </section>
      ) : null}

      {scope === 'all' && grouped.series.length > 0 ? (
        <section>
          <SectionHeader title="Séries" subtitle={`${grouped.series.length} résultat(s)`} />
          <MediaGrid items={grouped.series as MediaSummary[]} />
        </section>
      ) : null}

      {scope !== 'all' && searchQuery.data?.length ? <MediaGrid items={searchQuery.data} /> : null}
    </div>
  );
}
