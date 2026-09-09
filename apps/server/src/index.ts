import { createApp } from './app.js';
import { config, origins } from './config.js';
const { app } = await createApp({
  origins,
  databaseUrl: config.DATABASE_URL,
  logLevel: config.LOG_LEVEL,
  trustProxy: config.TRUST_PROXY === 'true',
  maxRooms: config.MAX_ROOMS,
});
if (!config.DATABASE_URL)
  app.log.warn(
    'DATABASE_URL absent : parties jouables, résultats non persistés (développement uniquement).',
  );
try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void app
      .close()
      .then(() => {
        process.exitCode = 0;
      })
      .catch((error) => {
        app.log.error(error);
        process.exitCode = 1;
      });
  });
}
