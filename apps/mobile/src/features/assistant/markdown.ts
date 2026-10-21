/**
 * The small Markdown subset the language models use in their answers: paragraphs, headings,
 * bullet and numbered lists, **bold** and `code`. Anything else stays as plain text, so a
 * stray asterisk never hides words.
 */
export type Inline = { text: string; bold?: true; code?: true };

export type Block =
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'heading'; inlines: Inline[] }
  | { kind: 'bullet'; inlines: Inline[] }
  | { kind: 'numbered'; marker: string; inlines: Inline[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', inlines: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
  };

  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (line.trim() === '') {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ kind: 'heading', inlines: parseInline(heading[1]!) });
    } else if (bullet) {
      flush();
      blocks.push({ kind: 'bullet', inlines: parseInline(bullet[1]!) });
    } else if (numbered) {
      flush();
      blocks.push({
        kind: 'numbered',
        marker: `${numbered[1]}.`,
        inlines: parseInline(numbered[2]!),
      });
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/** `**bold**`, `__bold__` and `` `code` ``; unmatched markers are kept as written. */
export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  const pattern = /\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at) });
    if (match[3] !== undefined) parts.push({ text: match[3], code: true });
    else parts.push({ text: (match[1] ?? match[2])!, bold: true });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
