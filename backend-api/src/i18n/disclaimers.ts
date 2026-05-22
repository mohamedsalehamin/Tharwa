/** API returns one `disclaimer` string per OpenAPI; embed AR + EN for clients to split if needed later. */
export const DISCLAIMER_COMBINED =
  'المعلومات للاطلاع فقط وليست استشارة استثمارية. | For information only; not investment advice.';

export const disclaimerForLocale = (_acceptLanguage: string | undefined) => DISCLAIMER_COMBINED;
