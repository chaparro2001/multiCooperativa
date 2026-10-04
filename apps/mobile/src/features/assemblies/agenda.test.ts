import { describe, expect, it } from 'vitest';

import { movePoint, newPoint, participation, toPointInputs } from './agenda';

describe('orden del día en el editor (HU-ASA-01, HU-ASA-02)', () => {
  it('mueve un punto arriba y abajo sin salirse de la lista', () => {
    expect(movePoint(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(movePoint(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(movePoint(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(movePoint(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('un punto votable lleva mayoría (simple si no se eligió) y uno informativo ninguna', () => {
    const votable = { ...newPoint(), title: ' Cuentas ', votable: true };
    const informative = { ...newPoint(), title: 'Informe', majority: 'reforzada' as const };

    expect(toPointInputs([votable, informative])).toEqual([
      { title: 'Cuentas', description: '', votable: true, majority: 'simple' },
      { title: 'Informe', description: '', votable: false, majority: null },
    ]);
  });

  it('conserva el id de los puntos ya guardados', () => {
    expect(toPointInputs([{ ...newPoint(), id: 'p-1', title: 'X' }])[0]).toMatchObject({
      id: 'p-1',
    });
  });

  it('muestra la participación sobre el censo', () => {
    expect(participation(2, 4)).toBe('2 de 4 (50 %)');
    expect(participation(0, null)).toBe('0 votos');
  });
});
