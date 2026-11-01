/**
 * Title normalisation for movie matching (research.md §5). Normalised titles are compared for
 * exact equality only; there is no fuzzy matching, because a wrong merge is worse than a
 * duplicate (FR-005).
 */

/**
 * Format and language tags cinemas add to titles, as whole words after normalisation:
 * "Kopa 3D", "Kopa (LT sub.)", "Kopa ORG", "Mažasis princas (dubliuotas)",
 * "Mažoji Amelija (įgarsinta lietuviškai)".
 */
const TAG_WORDS = new Set([
  '2d',
  '3d',
  'imax',
  '4dx',
  'screenx',
  'lt',
  'org',
  'sub',
  'subtitrai',
  'subtitrais',
  'dubliuotas',
  'dubliuota',
  'igarsinta',
  'igarsintas',
  'lietuviskai',
]);

/** "Monster Mia (2026)": a production year in brackets is metadata, not part of the title. */
const YEAR_IN_BRACKETS = /\(\s*(?:18|19|20)\d{2}\s*\)/g;

/** Lower-case, strip diacritics, and turn everything but letters and digits into single spaces. */
function simplify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** "Kopa. Trečia dalis (LT sub.)" → "kopa trecia dalis". */
export function normalizeTitle(title: string): string {
  const simplified = simplify(title.replace(YEAR_IN_BRACKETS, ' '));
  const withoutTags = simplified
    .split(' ')
    .filter((word) => !TAG_WORDS.has(word))
    .join(' ');
  // A title made only of tags (e.g. "3D") keeps its words rather than becoming empty.
  return withoutTags.length > 0 ? withoutTags : simplified;
}

/** Vue publishes "LOCAL TITLE (Original Title)" in a single field. */
const TRAILING_BRACKETS = /^(.+?)\s*\(([^()]+)\)\s*$/;

/** The original title hidden in a "Local (Original)" title, if the brackets hold one. */
function originalTitleInBrackets(title: string): string | null {
  const inBrackets = TRAILING_BRACKETS.exec(title)?.[2];
  if (inBrackets === undefined) return null;
  const words = simplify(inBrackets).split(' ');
  // "(LT sub.)" holds only tags and "(1997)" holds no letters: neither is an original title.
  const isOnlyTags = words.every((word) => TAG_WORDS.has(word));
  const hasLetters = /\p{L}/u.test(inBrackets);
  return isOnlyTags || !hasLetters ? null : inBrackets;
}

type Titles = { title: string; originalTitle: string | null; englishTitle: string | null };

/** "The Uprising" and "Uprising" are the same title; a lone "A" stays a title. */
function withoutLeadingArticle(key: string): string {
  const stripped = key.replace(/^(the|a|an) /, '');
  return stripped.length > 0 ? stripped : key;
}

/**
 * Festival programmes cinemas put around a title: the Scanorama label ("SCA26: Rozė",
 * "SCA: Rozė", "SCANORAMA '26: „Rozė“") and the Fliko sites' "Rozė | Scanorama".
 */
const PROGRAMME_AFTER_BAR = /\s+\|\s+.*$/;
const SCANORAMA_LABEL = /^(?:sca|scanorama)(?: ?\d{2})? (?=\S)/;

/**
 * The Sunday family series around a title: Pasaka's "Šeimų sekmadienis: Rozė" and Garsas's
 * "Rozė | Sekmadienis su vaikais". It says when a film runs, not which film it is.
 */
const SUNDAY_SERIES_LABEL = /^šeimų sekmadienis:\s*|\s+\|\s+sekmadienis su vaikais\s*$/giu;

/** The title to show and match on; a title that is only the label stays as it is. */
export function withoutSeriesLabel(title: string): string {
  const stripped = title.replace(SUNDAY_SERIES_LABEL, '');
  return stripped.length > 0 ? stripped : title;
}

function keyOf(title: string): string {
  const withoutProgramme = withoutSeriesLabel(title).replace(PROGRAMME_AFTER_BAR, '');
  const key = normalizeTitle(withoutProgramme.length > 0 ? withoutProgramme : title);
  return withoutLeadingArticle(key.replace(SCANORAMA_LABEL, ''));
}

/**
 * Every title a listing is known by, as normalised keys, most telling first: the English title,
 * the original title, then the Lithuanian title. Two listings can only be the same movie if they
 * share one of these (research.md §5).
 */
export function titleKeysOf(listing: Titles): string[] {
  const original = listing.originalTitle ?? originalTitleInBrackets(listing.title);
  const keys = [listing.englishTitle, original, listing.title]
    .filter((title): title is string => title !== null)
    .map(keyOf)
    .filter((key) => key.length > 0);
  return [...new Set(keys)];
}

/**
 * The key a movie is named by (its id comes from it): the English title when known, otherwise
 * the original title, otherwise the Lithuanian title.
 */
export function matchKeyOf(listing: Titles): string {
  return titleKeysOf(listing)[0] ?? normalizeTitle(listing.title);
}
