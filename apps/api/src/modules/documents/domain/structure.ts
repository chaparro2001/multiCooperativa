/**
 * Structure of Spanish cooperative documents (bylaws, regulations, minutes), recognized line by
 * line in the text a PDF gives: PDF extraction keeps hard line breaks but no blank lines between
 * paragraphs, so the start of a unit is read from how the line begins.
 */
export type LineKind =
  /** TÍTULO / CAPÍTULO / SECCIÓN / Disposición / an ALL-CAPS line: opens or changes a section. */
  | { kind: 'heading'; level: number; text: string }
  /** "Artículo 14. …": a self-contained unit that is kept whole when it fits. */
  | { kind: 'article'; label: string }
  /** "3. …", "Primero. …", "Punto 2. …": a numbered unit of regulations and minutes. */
  | { kind: 'item' }
  | { kind: 'text' };

const ROMAN_OR_NUMBER = String.raw`(?:[ivxlcdm]+|\d+|preliminar|[úu]nic[oa]|primer[oa]|segund[oa])`;
const TITLE = new RegExp(String.raw`^(?:t[íi]tulo|libro|parte)\s+${ROMAN_OR_NUMBER}\b`, 'i');
const CHAPTER = new RegExp(String.raw`^cap[íi]tulo\s+${ROMAN_OR_NUMBER}\b`, 'i');
const SECTION = new RegExp(String.raw`^secci[óo]n\s+${ROMAN_OR_NUMBER}\b`, 'i');
const PROVISION = /^disposici[óo]n(?:es)?\s+(?:adicional|transitoria|final|derogatoria)/i;
const ARTICLE = /^(art[íi]culo)\s+(\d+(?:\.\d+)?)\s*[º°ª]?(?=[\s.:\-–]|$)/i;
const ITEM =
  /^(?:\d{1,2}(?:\.\d{1,2})*[.)]\s+\p{Lu}|(?:primero|segundo|tercero|cuarto|quinto|sexto|s[ée]ptimo|octavo|noveno|d[ée]cimo)\.\s|punto\s+\d{1,2}\.\s)/iu;

/** Only a page number: "3", "Página 3", "- 3 -", "3 / 10", "Página 3 de 10". */
const PAGE_NUMBER =
  /^(?:[-–—]\s*)?(?:p[áa]g(?:ina|\.)?\s*)?\d{1,4}(?:\s*(?:de|\/)\s*\d{1,4})?(?:\s*[-–—])?$/i;

export const isPageNumber = (line: string): boolean => PAGE_NUMBER.test(line.trim());

/** At least three letters and no lowercase ones: "ESTATUTOS DE LA COOPERATIVA". */
function isAllCaps(line: string): boolean {
  const letters = line.match(/\p{L}/gu) ?? [];
  return letters.length >= 3 && line.length <= 100 && line === line.toUpperCase();
}

export function classifyLine(rawLine: string): LineKind {
  const line = rawLine.trim();
  if (TITLE.test(line) || PROVISION.test(line)) return { kind: 'heading', level: 1, text: line };
  if (CHAPTER.test(line)) return { kind: 'heading', level: 2, text: line };
  if (SECTION.test(line)) return { kind: 'heading', level: 3, text: line };
  const article = ARTICLE.exec(line);
  if (article) return { kind: 'article', label: `Artículo ${article[2]}` };
  if (ITEM.test(line)) return { kind: 'item' };
  if (isAllCaps(line)) return { kind: 'heading', level: 1, text: line };
  return { kind: 'text' };
}

/** Section path of the headings seen so far: a TÍTULO resets its CAPÍTULOs, and so on. */
export class SectionPath {
  private readonly levels: string[] = [];

  enter(level: number, text: string): void {
    this.levels.length = level - 1;
    this.levels[level - 1] = text;
  }

  toString(): string {
    return this.levels.filter(Boolean).join(' > ');
  }
}
