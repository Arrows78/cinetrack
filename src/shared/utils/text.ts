// Loosens title comparison past exact-string equality -- different sources
// don't always agree on punctuation, diacritics, or a leading article for
// the same title ("Marvel's Daredevil" vs "Daredevil", accented vs plain
// spellings of the same word). Shared by the TV Time import matcher
// (tvtime-import-service.ts) and the Library Health Center's duplicate
// detector (library-health-selectors.ts) so both treat "the same title"
// identically instead of drifting apart.
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
