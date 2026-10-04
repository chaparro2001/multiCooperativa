import { describe, expect, it } from 'vitest';

import { inlineDisposition, newFileKey } from './file-storage';

const COOP = '11111111-1111-4111-8111-111111111111';

describe('claves de fichero (RNF-DOC-04, ADR-003)', () => {
  it('agrupan por cooperativa y área y terminan en un UUID aleatorio', () => {
    expect(newFileKey(COOP, 'comunicados')).toMatch(
      new RegExp(`^cooperativas/${COOP}/comunicados/[0-9a-f-]{36}$`),
    );
  });

  it('no se repiten', () => {
    expect(newFileKey(COOP, 'documentos')).not.toBe(newFileKey(COOP, 'documentos'));
  });

  it('rechazan áreas que podrían escapar del prefijo', () => {
    expect(() => newFileKey(COOP, '../otra')).toThrow();
    expect(() => newFileKey(COOP, 'Documentos')).toThrow();
  });
});

describe('nombre de descarga', () => {
  it('conserva el nombre en UTF-8 y da una alternativa ASCII', () => {
    expect(inlineDisposition('Acta de la asamblea – junio.pdf')).toBe(
      'inline; filename="Acta de la asamblea _ junio.pdf"; filename*=UTF-8\'\'Acta%20de%20la%20asamblea%20%E2%80%93%20junio.pdf',
    );
  });

  it('quita tildes en la alternativa ASCII y neutraliza comillas', () => {
    expect(inlineDisposition('Año "fiscal".pdf')).toMatch(/^inline; filename="Ano _fiscal_.pdf";/);
  });
});
