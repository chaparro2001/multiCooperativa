import { describe, expect, it } from 'vitest';

import {
  assertCanAddVersion,
  assertValidFile,
  createDocument,
  isVisible,
  MAX_FILE_BYTES,
  TITLE_MAX_LENGTH,
  withdraw,
} from './document';
import {
  DocumentFileRejectedError,
  InvalidDocumentError,
  InvalidDocumentTransitionError,
} from './errors';

const valid = {
  title: 'Estatutos sociales',
  category: 'estatutos',
  documentDate: '2026-03-15',
} as const;

describe('subir un documento (HU-DOC-01)', () => {
  it('queda publicado con su título, categoría y fecha', () => {
    expect(createDocument({ ...valid, title: '  Estatutos sociales ' })).toEqual({
      status: 'publicado',
      title: 'Estatutos sociales',
      category: 'estatutos',
      documentDate: '2026-03-15',
    });
  });

  it('exige título, de 150 caracteres como máximo', () => {
    expect(() => createDocument({ ...valid, title: ' ' })).toThrow(InvalidDocumentError);
    expect(() => createDocument({ ...valid, title: 'x'.repeat(TITLE_MAX_LENGTH + 1) })).toThrow(
      InvalidDocumentError,
    );
    expect(() => createDocument({ ...valid, title: 'x'.repeat(TITLE_MAX_LENGTH) })).not.toThrow();
  });

  it('exige una fecha de calendario válida', () => {
    for (const documentDate of ['2026-02-30', '15/03/2026', '2026-3-5', '']) {
      expect(() => createDocument({ ...valid, documentDate })).toThrow(InvalidDocumentError);
    }
  });

  it('exige una categoría conocida', () => {
    expect(() => createDocument({ ...valid, category: 'facturas' as never })).toThrow(
      InvalidDocumentError,
    );
  });
});

describe('fichero (RN-DOC-02)', () => {
  it('Dado un PDF de hasta 20 MB, entonces se admite', () => {
    expect(() => assertValidFile({ isPdf: true, size: MAX_FILE_BYTES })).not.toThrow();
  });

  it('Dado un fichero que no es PDF, entonces se rechaza indicando el motivo', () => {
    expect(() => assertValidFile({ isPdf: false, size: 10 })).toThrow(
      expect.objectContaining({ reason: 'not_pdf' }),
    );
  });

  it('Dado un PDF de más de 20 MB, entonces se rechaza indicando el motivo', () => {
    expect(() => assertValidFile({ isPdf: true, size: MAX_FILE_BYTES + 1 })).toThrow(
      expect.objectContaining({ reason: 'too_large' }),
    );
  });

  it('un fichero vacío no es un documento', () => {
    expect(() => assertValidFile({ isPdf: true, size: 0 })).toThrow(DocumentFileRejectedError);
  });
});

describe('versiones y retirada (HU-DOC-04, HU-DOC-05)', () => {
  it('se añade una versión a un documento publicado', () => {
    expect(() => assertCanAddVersion(createDocument(valid))).not.toThrow();
  });

  it('un documento retirado no admite versiones', () => {
    expect(() => assertCanAddVersion(withdraw(createDocument(valid)))).toThrow(
      InvalidDocumentTransitionError,
    );
  });

  it('retirar es definitivo', () => {
    const withdrawn = withdraw(createDocument(valid));
    expect(withdrawn.status).toBe('retirado');
    expect(() => withdraw(withdrawn)).toThrow(InvalidDocumentTransitionError);
  });
});

describe('visibilidad (HU-DOC-03)', () => {
  it('con consulta solo se ven los publicados; con gestión, todos', () => {
    expect(isVisible('publicado', false)).toBe(true);
    expect(isVisible('retirado', false)).toBe(false);
    expect(isVisible('retirado', true)).toBe(true);
  });
});
