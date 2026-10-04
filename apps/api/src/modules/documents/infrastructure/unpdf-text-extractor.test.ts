import { describe, expect, it } from 'vitest';

import { buildPdf } from '../../../../test/pdf';
import { UnreadablePdfError } from '../application/ports/text-extractor';
import { UnpdfTextExtractor } from './unpdf-text-extractor';

const extractor = new UnpdfTextExtractor();

describe('extracción de texto de PDF', () => {
  it('devuelve el texto de cada página con su número, tildes incluidas', async () => {
    const pdf = await buildPdf([
      ['Artículo 1. Denominación', 'La cooperativa se denomina San Isidro.'],
      ['Artículo 2. Domicilio', 'El domicilio social está en Cáceres.'],
    ]);

    const pages = await extractor.extract(pdf);

    expect(pages.map((p) => p.page)).toEqual([1, 2]);
    expect(pages[0]?.text).toContain('La cooperativa se denomina San Isidro.');
    expect(pages[1]?.text).toContain('El domicilio social está en Cáceres.');
  });

  it('una página sin capa de texto vuelve vacía', async () => {
    const pages = await extractor.extract(await buildPdf([[]]));

    expect(pages).toEqual([{ page: 1, text: '' }]);
  });

  it('un fichero que no se puede leer como PDF falla con UnreadablePdfError', async () => {
    await expect(
      extractor.extract(new TextEncoder().encode('%PDF-1.4 roto')),
    ).rejects.toBeInstanceOf(UnreadablePdfError);
  });
});
