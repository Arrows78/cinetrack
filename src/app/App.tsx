import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AppRouter } from '@/app/router';
import { queryClient } from '@/app/query-client';
import { initializeDatabase } from '@/services/local/db';

export function App() {
  useEffect(() => {
    initializeDatabase().catch((error) => {
      console.warn('Database initialization fallback engaged:', error);
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </QueryClientProvider>
  );
}
