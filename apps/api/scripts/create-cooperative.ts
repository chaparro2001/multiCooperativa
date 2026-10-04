/**
 * Alta de una cooperativa con sus 4 perfiles predefinidos y un administrador.
 *
 *   ADMIN_PASSWORD='…' pnpm --filter @multicooperativa/api cooperative:create \
 *     --name "Cooperativa del Campo" --cif F12345678 \
 *     --admin-email admin@campo.es --admin-name "Ada Lovelace"
 *
 * La contraseña va por variable de entorno para que no quede en el historial
 * del shell. No hace falta si el administrador ya es usuario de la plataforma.
 */
import { parseArgs } from 'node:util';

import { loadEnv } from '../src/config/env';
import {
  AccessApplicationError,
  AccessDomainError,
  createAccessModule,
} from '../src/modules/access';
import { createPrismaClient } from '../src/shared/infrastructure/prisma';

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    cif: { type: 'string' },
    'admin-email': { type: 'string' },
    'admin-name': { type: 'string' },
  },
});

const missing = (['name', 'cif', 'admin-email', 'admin-name'] as const).filter(
  (option) => !values[option],
);
if (missing.length > 0) {
  console.error(`Faltan opciones: ${missing.map((option) => `--${option}`).join(', ')}`);
  process.exit(1);
}

const prisma = createPrismaClient(loadEnv(process.env).DATABASE_URL);

try {
  const result = await createAccessModule({ prisma }).provisionCooperative({
    name: values.name!,
    cif: values.cif!,
    admin: {
      email: values['admin-email']!,
      name: values['admin-name']!,
      password: process.env.ADMIN_PASSWORD || undefined,
    },
  });
  console.log(`Cooperativa creada: ${result.cooperativeId}`);
  console.log(
    `Administrador: usuario ${result.adminUserId}, membresía ${result.adminMembershipId}`,
  );
} catch (error) {
  if (error instanceof AccessApplicationError || error instanceof AccessDomainError) {
    console.error(`No se ha creado la cooperativa. ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await prisma.$disconnect();
}
