import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        <SectionHeader title={t('search.globalSearch')} subtitle={t('search.subtitle')} />
        <div className="space-y-4">
          <SearchBar value={query} onChange={setQuery} />
          <FilterBar
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: t('settings.all') },
              { value: 'movie', label: t('nav.movies') },
              { value: 'series', label: t('nav.series') },
            ]}
          />
        </div>
      </section>

      {searchQuery.isLoading ? <GridSkeleton count={8} /> : null}

      {debouncedQuery.trim().length < 2 ? (
        <EmptyState title={t('search.startTyping')} description={t('search.startTypingDesc')} />
      ) : null}

      {debouncedQuery.trim().length >= 2 && !searchQuery.isLoading && !searchQuery.data?.length ? (
        <EmptyState title={t('pages.noResults')} description={t('search.noResultsDesc')} />
      ) : null}

      {scope === 'all' && grouped.movies.length > 0 ? (
        <section>
          <SectionHeader
            title={t('nav.movies')}
            subtitle={t('search.resultsCount', { count: grouped.movies.length })}
          />
          <MediaGrid items={grouped.movies as MediaSummary[]} />
        </section>
      ) : null}

      {scope === 'all' && grouped.series.length > 0 ? (
        <section>
          <SectionHeader
            title={t('nav.series')}
            subtitle={t('search.resultsCount', { count: grouped.series.length })}
          />
          <MediaGrid items={grouped.series as MediaSummary[]} />
        </section>
      ) : null}

      {scope !== 'all' && searchQuery.data?.length ? <MediaGrid items={searchQuery.data} /> : null}
    </div>
  );
}
