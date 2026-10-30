import { LangSchema } from '@seansai/shared';
import { useEffect } from 'react';
import {
  createBrowserRouter,
  Outlet,
  redirect,
  useParams,
  type LoaderFunctionArgs,
  type RouteObject,
} from 'react-router';
import { Spinner } from '../components/atoms/Spinner/index.ts';
import { I18nProvider } from '../i18n/index.tsx';
import { getLang } from '../storage/settings.ts';

const DEFAULT_LANG = 'lt';

/** Unknown language prefixes are redirected to the same page in Lithuanian. */
function languageLoader({ params, request }: LoaderFunctionArgs) {
  if (LangSchema.safeParse(params.lang).success) return null;
  const url = new URL(request.url);
  const rest = url.pathname.split('/').slice(2).join('/');
  return redirect(`/${DEFAULT_LANG}/${rest}${url.search}`);
}

/** Provides the interface language from the URL and keeps `<html lang>` in sync with it. */
function LanguageRoot() {
  const lang = LangSchema.catch(DEFAULT_LANG).parse(useParams().lang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <I18nProvider lang={lang}>
      <Outlet />
    </I18nProvider>
  );
}

function RouteLoading() {
  return <Spinner label="Kraunama… / Loading…" />;
}

/** Page addresses are part of the contract: contracts/web-routes.md. */
export const routes: RouteObject[] = [
  {
    path: '/',
    loader: () => redirect(`/${getLang() ?? DEFAULT_LANG}/`),
    HydrateFallback: RouteLoading,
  },
  {
    path: '/:lang',
    loader: languageLoader,
    Component: LanguageRoot,
    HydrateFallback: RouteLoading,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import('../pages/MovieListPage.tsx')).MovieListPage,
        }),
      },
      {
        path: 'movie/:movieId',
        lazy: async () => ({ Component: (await import('../pages/MoviePage.tsx')).MoviePage }),
      },
      {
        path: '*',
        lazy: async () => ({
          Component: (await import('../pages/NotFoundPage.tsx')).NotFoundPage,
        }),
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
