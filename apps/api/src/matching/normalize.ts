/**
 * Title normalisation for movie matching (research.md §5). Normalised titles are compared for
 * exact equality only; there is no fuzzy matching, because a wrong merge is worse than a
 * duplicate (FR-005).
 */

/**
 * Format and language tags cinemas add to titles, as whole words after normalisation:
 * "Kopa 3D", "Kopa (LT sub.)", "Kopa ORG", "Mažasis princas (dubliuotas)".
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
]);

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
  const simplified = simplify(title);
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

/**
 * The key two listings must share to be the same movie: the normalised original title when
 * known, otherwise the normalised local title.
 */
export function matchKeyOf(listing: { title: string; originalTitle: string | null }): string {
  const original = listing.originalTitle ?? originalTitleInBrackets(listing.title);
  if (original !== null) {
    const key = normalizeTitle(original);
    if (key.length > 0) return key;
  }
  return normalizeTitle(listing.title);
}
