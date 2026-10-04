import { createApp } from './app';
import { loadEnv } from './config/env';

const env = loadEnv(process.env);

createApp().listen(env.PORT, () => {
  console.log(`API escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
});
