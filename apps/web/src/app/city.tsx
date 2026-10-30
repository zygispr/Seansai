import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { getCity, setCity } from '../storage/settings.ts';

type RememberedCity = { city: string | null; remember: (city: string) => void };

const RememberedCityContext = createContext<RememberedCity | null>(null);

/**
 * Holds the city remembered on this device, shared by every component that shows or changes it
 * (the header's city switcher and the pages). Still works for the visit when storage is
 * unavailable.
 */
export function CityProvider({ children }: { children: ReactNode }) {
  const [city, setRemembered] = useState(getCity);
  const value = useMemo<RememberedCity>(
    () => ({
      city,
      remember: (next) => {
        setCity(next);
        setRemembered(next);
      },
    }),
    [city],
  );
  return <RememberedCityContext value={value}>{children}</RememberedCityContext>;
}

/**
 * The chosen city (contracts/web-routes.md): a `?city=` link wins, so shared links show the same
 * screenings, and becomes the remembered city; otherwise the city remembered on this device.
 * Null until the user has chosen one.
 */
export function useCity(): { city: string | null; chooseCity: (city: string) => void } {
  const remembered = useContext(RememberedCityContext);
  if (!remembered) throw new Error('useCity() must be used inside <CityProvider>');
  const { city, remember } = remembered;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const fromLink = params.get('city');

  useEffect(() => {
    if (fromLink !== null && fromLink !== city) remember(fromLink);
  }, [fromLink, city, remember]);

  const chooseCity = (next: string) => {
    remember(next);
    // A link's city would otherwise keep overriding the new choice, and cinema filters name
    // cinemas of the old city.
    if (fromLink === null && !params.has('cinema')) return;
    const search = new URLSearchParams(params);
    if (fromLink !== null) search.set('city', next);
    search.delete('cinema');
    const query = search.toString();
    void navigate(
      { search: query === '' ? '' : `?${query}` },
      { replace: true, preventScrollReset: true },
    );
  };

  return { city: fromLink ?? city, chooseCity };
}
