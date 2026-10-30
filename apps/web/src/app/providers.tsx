import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '../api/client.ts';
import { CityProvider } from './city.tsx';

const MAX_RETRIES = 2;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A 4xx answer (unknown movie, invalid date) will not change on retry; failures without
        // a response or with a 5xx might.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status !== null && error.status < 500) &&
          failureCount < MAX_RETRIES,
      },
    },
  });
}

export function AppProviders({
  queryClient,
  children,
}: {
  queryClient: QueryClient;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <CityProvider>{children}</CityProvider>
    </QueryClientProvider>
  );
}
