/** Lower-case without diacritics, so "KASEJ" finds "Kasėjas" (FR-004 search). */
export function foldForSearch(text: string): string {
  return text.toLocaleLowerCase('lt').normalize('NFD').replace(/\p{M}/gu, '').trim();
}

/** Whether two titles differ beyond letter case and spacing, e.g. to show an original title. */
export function titlesDiffer(title: string, other: string | null): other is string {
  if (other === null) return false;
  const simple = (text: string) => text.toLocaleLowerCase('lt').replace(/\s+/g, ' ').trim();
  return simple(title) !== simple(other);
}

/**
 * The title shown under the Lithuanian one: the English title when a cinema states it, else the
 * original title; nothing when it would only repeat the Lithuanian title.
 */
export function secondaryTitle(movie: {
  title: string;
  originalTitle: string | null;
  englishTitle: string | null;
}): string | null {
  const other = movie.englishTitle ?? movie.originalTitle;
  return titlesDiffer(movie.title, other) ? other : null;
}
