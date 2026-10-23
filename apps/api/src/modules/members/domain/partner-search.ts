/** Lower case without accents or surrounding spaces: how names are compared. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

interface Searchable {
  name: string;
  partnerNumber: string | null;
  email: string;
}

/** Digits only, without leading zeros: "003" and "3" are the same partner number. */
const numeric = (value: string) =>
  /^\d+$/.test(value.trim()) ? value.trim().replace(/^0+/, '') : null;

/**
 * ADR-025: the partner an assistant question names. A partner number matches exactly (leading
 * zeros ignored); a name or an email matches by fragment, ignoring case and accents.
 */
export function matchesPartner(partner: Searchable, query: string): boolean {
  const needle = fold(query);
  if (!needle) return false;
  const wanted = numeric(needle);
  if (wanted !== null && partner.partnerNumber !== null) {
    if (numeric(partner.partnerNumber) === wanted) return true;
  }
  return fold(partner.name).includes(needle) || fold(partner.email).includes(needle);
}
