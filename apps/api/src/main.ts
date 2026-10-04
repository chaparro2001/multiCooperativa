import { createApi } from './api';
import { loadEnv } from './config/env';
import { ConsoleInvitationSender, UnavailableInvitationSender } from './modules/access';
import { createPrismaClient } from './shared/infrastructure/prisma';

const env = loadEnv(process.env);
const production = env.NODE_ENV === 'production';

const app = createApi({
  prisma: createPrismaClient(env.DATABASE_URL),
  jwtSecret: env.JWT_SECRET,
  // Sin proveedor de correo todavía: en desarrollo el enlace sale por consola;
  // en producción invitar devuelve 503 hasta configurarlo.
  invitationSender: production ? new UnavailableInvitationSender() : new ConsoleInvitationSender(),
  // En producción el API está detrás del proxy de Railway: un salto.
  trustProxy: production ? 1 : false,
});

app.listen(env.PORT, () => {
  console.log(`API escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
});
