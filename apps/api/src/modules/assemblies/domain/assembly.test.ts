import { describe, expect, it } from 'vitest';

import {
  type AssemblyInput,
  assertCanAttach,
  cancel,
  close,
  convene,
  createDraft,
  editDraft,
  isVisible,
} from './assembly';
import {
  InsufficientNoticeError,
  InvalidAssemblyError,
  InvalidAssemblyTransitionError,
} from './errors';

const now = new Date('2026-10-01T10:00:00Z');
const inDays = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

const input = (overrides: Partial<AssemblyInput> = {}): AssemblyInput => ({
  type: 'ordinaria',
  firstCallAt: inDays(20),
  secondCallAt: null,
  place: ' Salón social ',
  points: [
    { title: 'Aprobación de cuentas', description: '', votable: true, majority: 'simple' },
    {
      title: 'Informe del presidente',
      description: 'Resumen del año',
      votable: false,
      majority: null,
    },
  ],
  ...overrides,
});

describe('convocatoria en borrador (HU-ASA-01, HU-ASA-02)', () => {
  it('numera los puntos en orden y normaliza los textos', () => {
    const draft = createDraft(input());

    expect(draft).toMatchObject({ status: 'borrador', place: 'Salón social' });
    expect(draft.points.map((p) => [p.position, p.title, p.majority])).toEqual([
      [1, 'Aprobación de cuentas', 'simple'],
      [2, 'Informe del presidente', null],
    ]);
  });

  it('Dado un punto votable, entonces exige mayoría simple o reforzada', () => {
    expect(() =>
      createDraft(
        input({ points: [{ title: 'X', description: '', votable: true, majority: null }] }),
      ),
    ).toThrow(InvalidAssemblyError);
  });

  it('un punto informativo no lleva mayoría', () => {
    const draft = createDraft(
      input({ points: [{ title: 'X', description: '', votable: false, majority: 'reforzada' }] }),
    );
    expect(draft.points[0]?.majority).toBeNull();
  });

  it('la segunda convocatoria es posterior a la primera', () => {
    expect(() => createDraft(input({ secondCallAt: inDays(19) }))).toThrow(InvalidAssemblyError);
  });

  it('exige el lugar y títulos en todos los puntos', () => {
    expect(() => createDraft(input({ place: ' ' }))).toThrow(InvalidAssemblyError);
    expect(() =>
      createDraft(
        input({ points: [{ title: ' ', description: '', votable: false, majority: null }] }),
      ),
    ).toThrow(/Punto 1/);
  });

  it('Dado un borrador, cuando lo edito, entonces puedo añadir, quitar y reordenar puntos', () => {
    const edited = editDraft(
      createDraft(input()),
      input({
        points: [
          { title: 'Nuevo primero', description: '', votable: false, majority: null },
          {
            id: 'p-1',
            title: 'Aprobación de cuentas',
            description: '',
            votable: true,
            majority: 'reforzada',
          },
        ],
      }),
    );
    expect(edited.points.map((p) => [p.position, p.title, p.id])).toEqual([
      [1, 'Nuevo primero', undefined],
      [2, 'Aprobación de cuentas', 'p-1'],
    ]);
  });
});

describe('convocar (HU-ASA-01)', () => {
  it('Dado una fecha futura con antelación suficiente y al menos un punto, entonces pasa a convocada', () => {
    expect(convene(createDraft(input()), now, 15).status).toBe('convocada');
  });

  it('Dado una fecha con menos antelación de la configurada, entonces se rechaza indicando la antelación mínima', () => {
    const error = (() => {
      try {
        convene(createDraft(input({ firstCallAt: inDays(10) })), now, 15);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(InsufficientNoticeError);
    expect((error as InsufficientNoticeError).message).toContain('15 días');
  });

  it('justo con la antelación mínima es válido', () => {
    expect(() => convene(createDraft(input({ firstCallAt: inDays(15) })), now, 15)).not.toThrow();
  });

  it('sin puntos no se convoca', () => {
    expect(() => convene(createDraft(input({ points: [] })), now, 15)).toThrow(
      InvalidAssemblyError,
    );
  });

  it('una convocada no se vuelve a convocar ni se edita (RN-ASA-10)', () => {
    const convened = convene(createDraft(input()), now, 15);
    expect(() => convene(convened, now, 15)).toThrow(InvalidAssemblyTransitionError);
    expect(() => editDraft(convened, input())).toThrow(InvalidAssemblyTransitionError);
  });
});

describe('cancelar y cerrar', () => {
  const convened = () => convene(createDraft(input()), now, 15);

  it('se cancela una convocada', () => {
    expect(cancel(convened()).status).toBe('cancelada');
    expect(() => cancel(createDraft(input()))).toThrow(InvalidAssemblyTransitionError);
  });

  it('se cierra (celebrada) cuando no quedan votaciones abiertas', () => {
    expect(close(convened(), 0).status).toBe('celebrada');
    expect(() => close(convened(), 1)).toThrow(/votaciones abiertas/);
  });

  it('RN-ASA-10: celebrada o cancelada no admite cambios ni documentación', () => {
    expect(() => editDraft(close(convened(), 0), input())).toThrow(InvalidAssemblyTransitionError);
    expect(() => assertCanAttach('cancelada')).toThrow(InvalidAssemblyTransitionError);
    expect(() => assertCanAttach('convocada')).not.toThrow();
  });

  it('los borradores solo son visibles con gestión', () => {
    expect(isVisible('borrador', false)).toBe(false);
    expect(isVisible('convocada', false)).toBe(true);
    expect(isVisible('borrador', true)).toBe(true);
  });
});
