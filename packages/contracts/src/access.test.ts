import { describe, expect, it } from 'vitest';

import { inviteMemberRequestSchema, updateMemberRequestSchema } from './access';

const profileId = '10000000-0000-4000-8000-000000000001';

describe('contratos de miembros', () => {
  it('la invitación exige un email válido', () => {
    const base = { name: 'Grace', profileId, isPartner: true };

    expect(inviteMemberRequestSchema.safeParse({ ...base, email: 'no-es-email' }).success).toBe(
      false,
    );
    expect(inviteMemberRequestSchema.parse({ ...base, email: ' grace@campo.es ' }).email).toBe(
      'grace@campo.es',
    );
  });

  it('el cambio de un miembro es de perfil o de estado, no ambos ni otro', () => {
    expect(updateMemberRequestSchema.safeParse({ profileId }).success).toBe(true);
    expect(updateMemberRequestSchema.safeParse({ status: 'suspendida' }).success).toBe(true);
    expect(updateMemberRequestSchema.safeParse({ status: 'baja' }).success).toBe(false);
    expect(updateMemberRequestSchema.safeParse({ profileId, status: 'suspendida' }).success).toBe(
      false,
    );
    expect(updateMemberRequestSchema.safeParse({}).success).toBe(false);
  });
});
