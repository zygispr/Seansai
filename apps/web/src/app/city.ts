import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getCity, setCity } from '../storage/settings.ts';

/**
 * The chosen city (contracts/web-routes.md): a `?city=` link wins, so shared links show the same
 * screenings, and becomes the remembered city; otherwise the city remembered on this device.
 * Null until the user has chosen one.
 */
export function useCity(): { city: string | null; chooseCity: (city: string) => void } {
  const [params, setParams] = useSearchParams();
  const fromLink = params.get('city');
  const [remembered, setRemembered] = useState(getCity);

  useEffect(() => {
    if (fromLink !== null) setCity(fromLink);
  }, [fromLink]);

  const chooseCity = (city: string) => {
    setCity(city);
    setRemembered(city);
    // A link's city would otherwise keep overriding the new choice.
    if (fromLink !== null) {
      setParams((current) => {
        current.set('city', city);
        return current;
      });
    }
  };

  return { city: fromLink ?? remembered, chooseCity };
}
