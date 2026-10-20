import { describe, expect, it } from 'vitest';

import { movePoint, newPoint, participation, toPointInputs } from './agenda';

describe('agenda in the editor (US-ASM-01, US-ASM-02)', () => {
  it('moves a point up and down without leaving the list', () => {
    expect(movePoint(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(movePoint(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(movePoint(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(movePoint(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('a votable point carries a majority (simple if none was chosen) and an informative one has none', () => {
    const votable = { ...newPoint(), title: ' Accounts ', votable: true };
    const informative = { ...newPoint(), title: 'Report', majority: 'reinforced' as const };

    expect(toPointInputs([votable, informative])).toEqual([
      { title: 'Accounts', description: '', votable: true, majority: 'simple' },
      { title: 'Report', description: '', votable: false, majority: null },
    ]);
  });

  it('keeps the id of the points already saved', () => {
    expect(toPointInputs([{ ...newPoint(), id: 'p-1', title: 'X' }])[0]).toMatchObject({
      id: 'p-1',
    });
  });

  it('shows participation over the census', () => {
    expect(participation(2, 4)).toBe('2 de 4 (50 %)');
    expect(participation(0, null)).toBe('0 votos');
    expect(participation(1, null)).toBe('1 voto');
  });
});
