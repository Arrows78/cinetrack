import { useMemo, useState } from 'react';
import { FilterBar } from '@/components/media/filter-bar';
import { MediaGrid } from '@/components/media/media-grid';
import { SectionHeader } from '@/components/media/section-header';
import { EmptyState } from '@/components/states/empty-state';
import { usePreferences, useWatchlist } from '@/hooks/use-local-media';

export function WatchlistPage() {
  const { data: preferences } = usePreferences();
  const { data: items } = useWatchlist();
  const [filter, setFilter] = useState<'all' | 'movie' | 'series'>(
    preferences?.defaultWatchlistFilter ?? 'all',
  );
  const [sort, setSort] = useState<'recent' | 'title' | 'rating'>('recent');

  const filtered = useMemo(() => {
    const base = (items ?? []).filter((item) => (filter === 'all' ? true : item.mediaType === filter));
    return base
      .slice()
      .sort((a, b) => {
        if (sort === 'title') return a.title.localeCompare(b.title);
        if (sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0);
        return b.createdAt.localeCompare(a.createdAt);
      })
      .map((item) => ({
        id: item.mediaId,
        mediaType: item.mediaType,
        title: item.title,
        posterPath: item.posterPath,
        backdropPath: item.backdropPath,
        overview: '',
        year: item.year,
        rating: item.rating,
        genres: [],
        cast: [],
      }));
  }, [items, filter, sort]);

  return (
    <div className="space-y-6">
      <section className="surface rounded-[32px] p-6">
        <SectionHeader title="Watchlist" subtitle="Filtre par type et trie intelligemment ton backlog." />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <FilterBar
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Tout' },
              { value: 'movie', label: 'Films' },
              { value: 'series', label: 'Séries' },
            ]}
          />
          <FilterBar
            value={sort}
            onChange={setSort}
            options={[
              { value: 'recent', label: 'Récents' },
              { value: 'title', label: 'Titre' },
              { value: 'rating', label: 'Note' },
            ]}
          />
        </div>
      </section>

      {filtered.length ? (
        <MediaGrid items={filtered} />
      ) : (
        <EmptyState
          title="Watchlist vide"
          description="Ajoute des films ou séries depuis les cartes ou les fiches détail pour les retrouver ici."
        />
      )}
    </div>
  );
}
