import { PDFDocument, StandardFonts } from 'pdf-lib';

/** Builds a real PDF for tests: one page per entry, each line drawn as text. */
export async function buildPdf(pages: string[][]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = pdf.addPage([595, 842]);
    lines.forEach((line, i) => page.drawText(line, { x: 50, y: 790 - i * 16, size: 11, font }));
  }
  return pdf.save();
}
