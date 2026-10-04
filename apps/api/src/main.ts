import { createApi } from './api';
import { loadEnv } from './config/env';
import { ConsoleInvitationSender, UnavailableInvitationSender } from './modules/access';
import { OllamaEmbedder } from './modules/documents';
import { S3FileStorage, s3SettingsFromEnv } from './shared/files/s3-file-storage';
import { createPrismaClient } from './shared/infrastructure/prisma';

const env = loadEnv(process.env);
const production = env.NODE_ENV === 'production';

const files = new S3FileStorage(s3SettingsFromEnv(env));
// En local el bucket se crea solo; en producción se aprovisiona antes (ADR-005).
if (!production) await files.ensureBucket();

const { app, indexing, runDueDates } = createApi({
  prisma: createPrismaClient(env.DATABASE_URL),
  jwtSecret: env.JWT_SECRET,
  files,
  embedder: new OllamaEmbedder({ url: env.OLLAMA_URL, model: env.EMBEDDING_MODEL }),
  // Sin proveedor de correo todavía: en desarrollo el enlace sale por consola;
  // en producción invitar devuelve 503 hasta configurarlo.
  invitationSender: production ? new UnavailableInvitationSender() : new ConsoleInvitationSender(),
  // En producción el API está detrás del proxy de Railway: un salto.
  trustProxy: production ? 1 : false,
});

app.listen(env.PORT, () => {
  console.log(`API escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
});

// Lo que un reinicio dejó a medias se vuelve a indexar en segundo plano (ADR-006).
indexing
  .resumePending()
  .then((count) => count > 0 && console.log(`Indexación: ${count} versiones pendientes en cola`))
  .catch((error) =>
    console.error('No se han podido recuperar las indexaciones pendientes:', error),
  );

// Vencimientos de facturas (HU-FAC-07): al arrancar y cada hora. Trabaja por fechas y es
// idempotente (RNF-FAC-04), así que en la práctica actúa una vez al día.
const HOUR = 60 * 60 * 1000;
const dueDates = () =>
  runDueDates()
    .then(({ overdue, dueSoon }) => {
      if (overdue + dueSoon > 0)
        console.log(`Vencimientos: ${overdue} vencidas, ${dueSoon} avisos`);
    })
    .catch((error) => console.error('Fallo en el proceso de vencimientos:', error));
void dueDates();
setInterval(dueDates, HOUR).unref();
