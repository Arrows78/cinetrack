// Loosens title comparison past exact-string equality -- different sources
// don't always agree on punctuation, diacritics, or a leading article for
// the same title ("Marvel's Daredevil" vs "Daredevil", accented vs plain
// spellings of the same word). Used by the TV Time import matcher
// (tvtime-import-service.ts) to treat "the same title" identically across
// TV Time's and TMDB's own spelling/punctuation quirks.
//
// \p{Diacritic} (with the "u" flag) strips every combining mark the NFD
// decomposition below splits accented letters into.
export const normalizeTitle = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|an?)\s+/, "");
