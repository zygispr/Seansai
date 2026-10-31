import { z } from 'zod';
import { instantFromLocal } from '../../lib/time.ts';
import { normalizeTitle } from '../../matching/normalize.ts';
import { ageRatingOf, dubbingOf, formatOf, minutesOf } from '../parse.ts';
import type { AdapterContext, AdapterResult, SourceAdapter } from '../types.ts';

/**
 * Vue Vilnius (formerly Multikino). Runs with the owner-approved robots.txt override
 * (research.md §1b); any sign of blocking raises SourceBlockedError in the HTTP client, which
 * ends this cycle for the source without retrying.
 *
 * Showing times are local Vilnius time although the feed's `date` values end in "Z".
 */
const CINEMA_ID = '1001';
const SITE = 'https://vuekinas.lt';
const URL = `${SITE}/data/filmswithshowings/${CINEMA_ID}`;

const TimeSchema = z.object({
  session_id: z.string().min(1),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  screen_type: z.string().nullish(),
  screen_number: z.string().nullish(),
  hidden: z.boolean().default(false),
  link: z.string().min(1),
});

const FilmSchema = z.object({
  title: z.string().trim().min(1),
  title_orginal: z.string().nullish(),
  image_poster: z.string().nullish(),
  info_runningtime: z.string().nullish(),
  info_age: z.string().nullish(),
  genres: z.object({ names: z.array(z.object({ name: z.string() })) }).nullish(),
  showings: z.array(
    z.object({
      date_time: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      times: z.array(z.unknown()),
    }),
  ),
});
type Film = z.infer<typeof FilmSchema>;

const BodySchema = z.object({ films: z.array(z.unknown()) });

/** "ABSOLIUTUS BLOGIS (Resident Evil)" → "ABSOLIUTUS BLOGIS" when the brackets hold the original. */
function localTitle(title: string, originalTitle: string | null): string {
  const match = /^(.+?)\s*\(\s*([^()]+?)\s*\)\s*$/.exec(title);
  if (!match?.[1] || !match[2] || originalTitle === null) return title;
  return normalizeTitle(match[2]) === normalizeTitle(originalTitle) ? match[1] : title;
}

export const vueAdapter: SourceAdapter = {
  id: 'vue',
  async fetchScreenings({ http, registry }: AdapterContext): Promise<AdapterResult> {
    const cinema = registry.findBySourceKey('vue', CINEMA_ID);
    if (!cinema) throw new Error('Vue is missing from the cinema registry');

    const { films } = await http.getJson(URL, BodySchema);
    const result: AdapterResult = { screenings: [], skipped: [] };
    for (const raw of films) {
      const parsed = FilmSchema.safeParse(raw);
      if (!parsed.success) {
        result.skipped.push({
          reason: 'film without title or showings',
          raw: JSON.stringify(raw).slice(0, 500),
        });
        continue;
      }
      const film: Film = parsed.data;
      const originalTitle = film.title_orginal?.trim() || null;
      const title = localTitle(film.title, originalTitle);
      for (const showing of film.showings) {
        for (const rawTime of showing.times) {
          const time = TimeSchema.safeParse(rawTime);
          if (!time.success || time.data.hidden) {
            result.skipped.push({ reason: 'unusable showing time', raw: JSON.stringify(rawTime) });
            continue;
          }
          const { session_id, screen_number, screen_type, link } = time.data;
          result.screenings.push({
            sourceScreeningId: session_id,
            cinemaId: cinema.id,
            startsAt: instantFromLocal(showing.date_time, time.data.time),
            title,
            originalTitle,
            englishTitle: null,
            year: null,
            durationMinutes: minutesOf(film.info_runningtime),
            ageRating: ageRatingOf(film.info_age),
            genres: film.genres?.names.map((genre) => genre.name) ?? [],
            posterUrl: film.image_poster || null,
            hall: screen_number ? `${screen_number} salė` : null,
            format: formatOf(screen_type),
            spokenLanguage: null,
            subtitleLanguage: null,
            isDubbed: dubbingOf({
              title,
              originalTitle,
              spokenLanguage: null,
              subtitleLanguage: null,
              marked: /dubliuot|įgarsint/i.test(film.title),
            }),
            ticketUrl: new globalThis.URL(link, SITE).toString(),
          });
        }
      }
    }
    return result;
  },
};
