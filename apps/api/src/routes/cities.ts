import type { CitiesResponse } from '@seansai/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { cityName, type Queries } from '../db/queries.ts';
import { langSchema, parseQuery, setListCaching } from './http.ts';

type CitiesRouteOptions = { queries: Queries };

const QuerySchema = z.object({ lang: langSchema });

/** Cities with at least one supported cinema, for the first-visit city prompt (FR-013). */
export const citiesRoutes: FastifyPluginAsync<CitiesRouteOptions> = (app, { queries }) => {
  app.get('/cities', (request, reply): CitiesResponse => {
    const { lang } = parseQuery(QuerySchema, request.query, {});
    setListCaching(reply);
    return {
      cities: queries.listCities().map(({ city, cinemaCount }) => ({
        id: city.id,
        name: cityName(city, lang),
        cinemaCount,
      })),
    };
  });
  return Promise.resolve();
};
