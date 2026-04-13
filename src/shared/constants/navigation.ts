import {
  Clapperboard,
  Film,
  History,
  House,
  Search,
  Settings,
  Tv,
} from 'lucide-react';

export const navigationItems = [
  { label: 'Accueil', to: '/', icon: House },
  { label: 'Films', to: '/movies', icon: Film },
  { label: 'Séries', to: '/series', icon: Tv },
  { label: 'Recherche', to: '/search', icon: Search },
  { label: 'Watchlist', to: '/watchlist', icon: Clapperboard },
  { label: 'Activité', to: '/history', icon: History },
  { label: 'Paramètres', to: '/settings', icon: Settings },
] as const;
