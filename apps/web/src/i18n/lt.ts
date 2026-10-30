/**
 * Lithuanian interface text: the source of truth for message keys. `en.ts` must provide the same
 * keys. Movie titles are never translated (FR-017); they come from the cinemas.
 *
 * Plural messages list one form per Intl.PluralRules category: Lithuanian uses `one` (1, 21, 31…),
 * `few` (2–9, 22–29…), `many` (fractions) and `other` (0, 10–20, 30…).
 */
export type PluralForms = { other: string } & Partial<
  Record<'zero' | 'one' | 'two' | 'few' | 'many', string>
>;

export const lt = {
  'app.name': 'Seansai',
  'layout.skipToContent': 'Pereiti prie turinio',
  'layout.languageSwitch': 'Kalba',
  'layout.updatedAt': 'Atnaujinta {time}',
  'common.loading': 'Kraunama…',
  'poster.noImage': 'Plakato nėra',
  'movieList.title': 'Dabar rodomi filmai',
  'movie.screenings': 'Seansai',
  'notFound.title': 'Puslapis nerastas',
  'notFound.body': 'Tokio puslapio nėra. Galbūt nuoroda pasenusi.',
  'notFound.backToList': 'Grįžti į filmų sąrašą',
  'screenings.count': {
    one: '{count} seansas',
    few: '{count} seansai',
    many: '{count} seanso',
    other: '{count} seansų',
  },
} satisfies Record<string, string | PluralForms>;

/** Every catalogue has the same keys; plain strings stay strings, plurals stay plurals. */
export type Messages = {
  [Key in keyof typeof lt]: (typeof lt)[Key] extends string ? string : PluralForms;
};
