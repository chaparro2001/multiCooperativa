/**
 * Datos de ejemplo: dos cooperativas con usuarios de cada perfil.
 *
 *   pnpm --filter @multicooperativa/api db:seed
 *
 * Todos los usuarios tienen la contraseña de SEED_PASSWORD o, si no se define,
 * la de demostración que se imprime al final. Es idempotente: una cooperativa
 * que ya existe no se toca. Se niega a ejecutarse en producción.
 */
import { seedDemoData } from '../src/dev/demo-seed';
import { loadEnv } from '../src/config/env';
import {
  createAccessModule,
  invitationLink,
  UnavailableInvitationSender,
} from '../src/modules/access';
import { createPrismaClient } from '../src/shared/infrastructure/prisma';

const DEMO_PASSWORD = 'demo-cooperativa-2026';

const env = loadEnv(process.env);
if (env.NODE_ENV === 'production') {
  console.error('Los datos de ejemplo no se cargan en producción.');
  process.exit(1);
}

const password = process.env.SEED_PASSWORD || DEMO_PASSWORD;
const prisma = createPrismaClient(env.DATABASE_URL);
const access = createAccessModule({
  prisma,
  jwtSecret: env.JWT_SECRET,
  invitationSender: new UnavailableInvitationSender(),
});

try {
  const result = await seedDemoData({ prisma, access }, password);

  for (const cooperative of result.cooperatives) {
    const state = cooperative.created ? 'creada' : 'ya existía, sin cambios';
    console.log(`${cooperative.name} (${cooperative.id}): ${state}`);
  }
  for (const invitation of result.invitations) {
    console.log(`Invitación pendiente de ${invitation.email}: ${invitationLink(invitation.token)}`);
  }
  if (result.cooperatives.some((cooperative) => cooperative.created)) {
    console.log(
      `Contraseña de todos los usuarios: ${process.env.SEED_PASSWORD ? '(SEED_PASSWORD)' : password}`,
    );
    console.log('Usuarios: Documentacion/datos-de-ejemplo.md');
  }
} finally {
  await prisma.$disconnect();
}
