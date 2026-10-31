import { z } from 'zod';
import { SourceResponseError } from '../../lib/errors.ts';
import { ageRatingOf, dubbingOf, hoursAndMinutesOf, languageOf } from '../parse.ts';
import type { AdapterContext, AdapterResult, SourceAdapter, SourceScreening } from '../types.ts';

/**
 * Skalvija's WordPress endpoint, used by its own site. The body starts with PHP warnings before
 * the JSON. A show's own `title` is the programme it belongs to ("Repertuarinis seansas",
 * "Scanorama"); the film itself is the event the show points to.
 */
const URL = 'https://skalvija.lt/wp-json/data/v1/get_shows';
const SITE = 'https://skalvija.lt';

const ShowSchema = z.object({
  _id: z.union([z.string(), z.number()]).transform(String),
  start_date: z.number().int().positive(),
  eventid: z.union([z.string(), z.number()]).transform(String),
  title: z.array(z.string()).default([]),
  url: z.string().default(''),
});

const EventSchema = z.object({
  _id: z.union([z.string(), z.number()]).transform(String),
  title: z.string(),
  title_originalo_kalba: z.string().nullish(),
  infoline: z.string().nullish(),
  mainimg: z.string().nullish(),
  link: z.string().nullish(),
});
type Event = z.infer<typeof EventSchema>;

const BodySchema = z.object({ shows: z.array(z.unknown()), events: z.array(z.unknown()) });

/** Strips the PHP warnings in front of the JSON. */
function parseBody(body: string): z.infer<typeof BodySchema> {
  const start = body.search(/[{[]/);
  let data: unknown;
  try {
    data = JSON.parse(start === -1 ? body : body.slice(start));
  } catch (error) {
    throw new SourceResponseError(URL, 'no JSON in the response', { cause: error });
  }
  const parsed = BodySchema.safeParse(data);
  if (!parsed.success) throw new SourceResponseError(URL, 'missing shows or events');
  return parsed.data;
}

type FilmFacts = {
  ageRating: string | null;
  year: number | null;
  durationMinutes: number | null;
  spokenLanguage: string | null;
  subtitleLanguage: string | null;
};

/**
 * "Siaubo, Japonija, N-13, Japonų k., Lietuvių sub., 1998, 1.36": genres and countries (not told
 * apart, so not used), age rating, spoken language, subtitles, year, duration (h.mm).
 */
function parseInfoline(infoline: string): FilmFacts {
  const facts: FilmFacts = {
    ageRating: null,
    year: null,
    durationMinutes: null,
    spokenLanguage: null,
    subtitleLanguage: null,
  };
  for (const part of infoline.split(',').map((item) => item.trim())) {
    if (/^(N-?\d{1,2}|V)$/.test(part)) facts.ageRating = ageRatingOf(part);
    else if (/^(18|19|20)\d{2}$/.test(part)) facts.year = Number(part);
    else if (/^\d\.\d{2}$/.test(part)) facts.durationMinutes = hoursAndMinutesOf(part);
    else if (/\bsub\.?$/i.test(part)) facts.subtitleLanguage ??= languageOf(part);
    else if (/\bk\.?$/i.test(part)) facts.spokenLanguage ??= languageOf(part);
  }
  return facts;
}

function toScreening(
  show: z.infer<typeof ShowSchema>,
  event: Event | undefined,
  cinemaId: string,
): SourceScreening | null {
  const title = event?.title.trim() || show.title[0]?.trim() || '';
  if (title === '') return null;
  const originalTitle = event?.title_originalo_kalba?.trim() || null;
  const facts = parseInfoline(event?.infoline ?? '');
  const filmPage = event?.link ? `${SITE}${event.link}` : SITE;
  return {
    sourceScreeningId: show._id,
    cinemaId,
    startsAt: new Date(show.start_date * 1000),
    title,
    originalTitle,
    englishTitle: null,
    year: facts.year,
    durationMinutes: facts.durationMinutes,
    ageRating: facts.ageRating,
    genres: [],
    posterUrl: event?.mainimg || null,
    hall: null,
    format: null,
    spokenLanguage: facts.spokenLanguage,
    subtitleLanguage: facts.subtitleLanguage,
    isDubbed: dubbingOf({
      title,
      originalTitle,
      spokenLanguage: facts.spokenLanguage,
      subtitleLanguage: facts.subtitleLanguage,
    }),
    ticketUrl: show.url || filmPage,
  };
}

export const skalvijaAdapter: SourceAdapter = {
  id: 'skalvija',
  async fetchScreenings({ http, registry }: AdapterContext): Promise<AdapterResult> {
    const cinema = registry.findBySourceKey('skalvija', 'main');
    if (!cinema) throw new Error('Skalvija is missing from the cinema registry');

    const body = parseBody(await http.getText(URL));
    const events = new Map<string, Event>();
    for (const raw of body.events) {
      const event = EventSchema.safeParse(raw);
      if (event.success) events.set(event.data._id, event.data);
    }

    const result: AdapterResult = { screenings: [], skipped: [] };
    for (const raw of body.shows) {
      const show = ShowSchema.safeParse(raw);
      const screening = show.success
        ? toScreening(show.data, events.get(show.data.eventid), cinema.id)
        : null;
      if (screening) result.screenings.push(screening);
      else result.skipped.push({ reason: 'show without start or title', raw: JSON.stringify(raw) });
    }
    return result;
  },
};
