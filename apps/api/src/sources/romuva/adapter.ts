import { z } from 'zod';
import { SourceResponseError } from '../../lib/errors.ts';
import { instantFromLocal } from '../../lib/time.ts';
import type { AdapterContext, AdapterResult, SourceAdapter } from '../types.ts';

/**
 * Romuva's ticket page embeds its whole calendar as `fullCalendar({ events: [...] })`. Events
 * carry only a title, a local start ("YYYY-MM-DD HH:MM") and the event page link.
 */
const URL = 'https://bilietai.kcromuva.lt/';

const EventSchema = z.object({
  title: z.string().trim().min(1),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
  url: z.string().default(''),
});

/** The JSON array that starts at `start`, found by matching brackets outside strings. */
function jsonArrayAt(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function calendarEvents(page: string): unknown[] {
  const match = /fullCalendar\(\s*\{[\s\S]*?\bevents\s*:\s*\[/.exec(page);
  const array = match ? jsonArrayAt(page, match.index + match[0].length - 1) : null;
  if (array === null) throw new SourceResponseError(URL, 'no calendar events on the page');
  try {
    return z.array(z.unknown()).parse(JSON.parse(array));
  } catch (error) {
    throw new SourceResponseError(URL, 'calendar events are not valid JSON', { cause: error });
  }
}

export const romuvaAdapter: SourceAdapter = {
  id: 'romuva',
  async fetchScreenings({ http, registry }: AdapterContext): Promise<AdapterResult> {
    const cinema = registry.findBySourceKey('romuva', 'main');
    if (!cinema) throw new Error('Romuva is missing from the cinema registry');

    const result: AdapterResult = { screenings: [], skipped: [] };
    for (const raw of calendarEvents(await http.getText(URL))) {
      const event = EventSchema.safeParse(raw);
      if (!event.success) {
        result.skipped.push({ reason: 'event without title or start', raw: JSON.stringify(raw) });
        continue;
      }
      const { title, start, url } = event.data;
      const [date = '', time = ''] = start.split(' ');
      result.screenings.push({
        // Each event page is one screening: /lt/e/{id}/{slug}.
        sourceScreeningId: /\/e\/(\d+)\//.exec(url)?.[1] ?? `${start} ${title}`,
        cinemaId: cinema.id,
        startsAt: instantFromLocal(date, time),
        title,
        originalTitle: null,
        englishTitle: null,
        year: null,
        durationMinutes: null,
        ageRating: null,
        genres: [],
        posterUrl: null,
        hall: null,
        format: null,
        spokenLanguage: null,
        subtitleLanguage: null,
        isDubbed: null,
        ticketUrl: url || cinema.websiteUrl,
      });
    }
    return result;
  },
};
