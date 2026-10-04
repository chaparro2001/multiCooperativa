import { createApp } from './app';
import { loadEnv } from './config/env';
import { createAccessModule } from './modules/access';
import { createPrismaClient } from './shared/infrastructure/prisma';

const env = loadEnv(process.env);
const prisma = createPrismaClient(env.DATABASE_URL);
const access = createAccessModule({ prisma, jwtSecret: env.JWT_SECRET });

createApp([access.router]).listen(env.PORT, () => {
  console.log(`API escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
});
