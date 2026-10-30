import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppProviders } from '../../src/app/providers.tsx';
import { routes } from '../../src/app/router.tsx';

/** Renders the real app routes at `path`; returns the router to inspect the final location. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  const location = () => `${router.state.location.pathname}${router.state.location.search}`;
  return { ...result, router, location };
}
