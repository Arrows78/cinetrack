import { Clapperboard, Film, History, House, Search, Settings, Tv } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const useNavigationItems = () => {
  const { t } = useTranslation();

  return [
    { label: t('nav.home'), to: '/', icon: House },
    { label: t('nav.movies'), to: '/movies', icon: Film },
    { label: t('nav.series'), to: '/series', icon: Tv },
    { label: t('nav.search'), to: '/search', icon: Search },
    { label: t('nav.watchlist'), to: '/watchlist', icon: Clapperboard },
    { label: t('nav.history'), to: '/history', icon: History },
    { label: t('nav.settings'), to: '/settings', icon: Settings },
  ] as const;
};
