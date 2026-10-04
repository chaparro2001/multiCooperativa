import { describe, expect, it } from 'vitest';

import { formatDay, formatSize, fromLocalInput, today, toLocalInput } from './format';

describe('formato', () => {
  it('muestra un día en español sin desfase horario', () => {
    expect(formatDay('2026-03-15')).toBe('15 de marzo de 2026');
  });

  it('muestra tamaños legibles', () => {
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(3.5 * 1024 * 1024)).toBe('3,5 MB');
  });

  it('da la fecha de hoy como AAAA-MM-DD', () => {
    expect(today(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('convierte fecha y hora en texto a un instante y vuelve igual', () => {
    const iso = fromLocalInput('2026-06-20 19:30');
    expect(iso).not.toBeNull();
    expect(toLocalInput(iso!)).toBe('2026-06-20 19:30');
  });

  it('rechaza fechas y horas imposibles o mal escritas', () => {
    expect(fromLocalInput('2026-02-30 10:00')).toBeNull();
    expect(fromLocalInput('20/06/2026 19:30')).toBeNull();
    expect(fromLocalInput('2026-06-20 25:00')).toBeNull();
  });
});
