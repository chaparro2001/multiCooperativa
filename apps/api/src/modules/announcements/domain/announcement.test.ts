import { describe, expect, it } from 'vitest';

import {
  assertCanAttach,
  BODY_MAX_LENGTH,
  createDraft,
  edit,
  isVisible,
  MAX_ATTACHMENT_BYTES,
  publish,
  setPinned,
  TITLE_MAX_LENGTH,
  withdraw,
} from './announcement';
import {
  AttachmentRejectedError,
  InvalidAnnouncementError,
  InvalidAnnouncementTransitionError,
} from './errors';

const now = new Date('2026-10-10T10:00:00Z');
const later = new Date('2026-10-11T10:00:00Z');

const draft = () => createDraft({ title: 'Asamblea general', body: 'Se convoca la asamblea.' });
const published = () => publish(draft(), now);

describe('borrador (HU-COM-01)', () => {
  it('Dado un título y un cuerpo válidos, cuando lo guardo sin publicar, entonces queda como borrador', () => {
    expect(draft()).toEqual({
      status: 'borrador',
      title: 'Asamblea general',
      body: 'Se convoca la asamblea.',
      pinned: false,
      publishedAt: null,
      editedAt: null,
    });
  });

  it('un borrador puede estar incompleto: se exige al publicar', () => {
    expect(createDraft({ title: '', body: '' }).status).toBe('borrador');
  });

  it('quita los espacios de los extremos', () => {
    expect(createDraft({ title: '  Hola ', body: ' Texto\n' })).toMatchObject({
      title: 'Hola',
      body: 'Texto',
    });
  });

  it('RN-COM-04: rechaza un título o un cuerpo demasiado largos, incluso en borrador', () => {
    const error = (() => {
      try {
        createDraft({
          title: 'x'.repeat(TITLE_MAX_LENGTH + 1),
          body: 'y'.repeat(BODY_MAX_LENGTH + 1),
        });
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(InvalidAnnouncementError);
    expect((error as InvalidAnnouncementError).issues).toEqual(['title_too_long', 'body_too_long']);
  });

  it('admite exactamente los máximos', () => {
    expect(() =>
      createDraft({ title: 'x'.repeat(TITLE_MAX_LENGTH), body: 'y'.repeat(BODY_MAX_LENGTH) }),
    ).not.toThrow();
  });
});

describe('publicar (HU-COM-01)', () => {
  it('Dado un borrador, cuando lo publico, entonces pasa a publicado con su fecha', () => {
    expect(published()).toMatchObject({ status: 'publicado', publishedAt: now, editedAt: null });
  });

  it('Dado un comunicado sin título o sin cuerpo, cuando intento publicarlo, entonces se indica qué falta', () => {
    try {
      publish(createDraft({ title: ' ', body: '' }), now);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidAnnouncementError);
      expect((error as InvalidAnnouncementError).issues).toEqual(['title_missing', 'body_missing']);
    }
  });

  it('solo se publica una vez (RN-COM-07: el aviso sale una sola vez)', () => {
    expect(() => publish(published(), later)).toThrow(InvalidAnnouncementTransitionError);
  });

  it('un comunicado retirado no se vuelve a publicar', () => {
    expect(() => publish(withdraw(published()), later)).toThrow(InvalidAnnouncementTransitionError);
  });
});

describe('editar (HU-COM-05)', () => {
  it('editar un borrador no lo marca como editado', () => {
    expect(edit(draft(), { title: 'Otro' }, later)).toMatchObject({
      title: 'Otro',
      editedAt: null,
    });
  });

  it('Dado un comunicado publicado, cuando lo edito, entonces se marca como editado con la fecha', () => {
    expect(edit(published(), { body: 'Corregido' }, later)).toMatchObject({
      status: 'publicado',
      body: 'Corregido',
      publishedAt: now,
      editedAt: later,
    });
  });

  it('un comunicado publicado no puede quedarse sin título ni cuerpo', () => {
    expect(() => edit(published(), { body: '' }, later)).toThrow(InvalidAnnouncementError);
  });

  it('un comunicado retirado no se edita', () => {
    expect(() => edit(withdraw(published()), { title: 'x' }, later)).toThrow(
      InvalidAnnouncementTransitionError,
    );
  });
});

describe('retirar y fijar (HU-COM-05, HU-COM-06)', () => {
  it('RN-COM-02: un comunicado publicado se retira, no se borra', () => {
    expect(withdraw(published()).status).toBe('retirado');
  });

  it('solo se retira lo publicado', () => {
    expect(() => withdraw(draft())).toThrow(InvalidAnnouncementTransitionError);
  });

  it('se fija y se desfija un comunicado publicado', () => {
    const pinned = setPinned(published(), true);
    expect(pinned.pinned).toBe(true);
    expect(setPinned(pinned, false).pinned).toBe(false);
  });

  it('un borrador no se fija', () => {
    expect(() => setPinned(draft(), true)).toThrow(InvalidAnnouncementTransitionError);
  });

  it('retirar quita el fijado', () => {
    expect(withdraw(setPinned(published(), true)).pinned).toBe(false);
  });
});

describe('visibilidad (RN-COM-03)', () => {
  it('con consulta solo se ven los publicados', () => {
    expect(isVisible('publicado', false)).toBe(true);
    expect(isVisible('borrador', false)).toBe(false);
    expect(isVisible('retirado', false)).toBe(false);
  });

  it('con gestión se ven todos', () => {
    expect(isVisible('borrador', true)).toBe(true);
    expect(isVisible('retirado', true)).toBe(true);
  });
});

describe('adjuntos (RN-COM-05)', () => {
  const pdf = { size: 1000, isPdf: true };

  it('admite hasta 3 PDF', () => {
    expect(() => assertCanAttach(draft(), 2, pdf)).not.toThrow();
    expect(() => assertCanAttach(draft(), 3, pdf)).toThrow(
      expect.objectContaining({ reason: 'too_many' }),
    );
  });

  it('solo PDF', () => {
    expect(() => assertCanAttach(draft(), 0, { size: 1000, isPdf: false })).toThrow(
      expect.objectContaining({ reason: 'not_pdf' }),
    );
  });

  it('de 10 MB como máximo', () => {
    expect(() =>
      assertCanAttach(draft(), 0, { size: MAX_ATTACHMENT_BYTES, isPdf: true }),
    ).not.toThrow();
    expect(() =>
      assertCanAttach(draft(), 0, { size: MAX_ATTACHMENT_BYTES + 1, isPdf: true }),
    ).toThrow(AttachmentRejectedError);
  });

  it('no se adjunta a un comunicado retirado', () => {
    expect(() => assertCanAttach(withdraw(published()), 0, pdf)).toThrow(
      InvalidAnnouncementTransitionError,
    );
  });
});
