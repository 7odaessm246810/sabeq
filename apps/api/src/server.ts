/**
 * Process entry point: load config, connect PostgreSQL and Redis, build the app, listen, shut down
 * cleanly (stop accepting → finish requests → close database and Redis).
 */
import { createApp } from './app.js';
import { ConfigError, loadConfig, type Config } from './config/env.js';
import { createLogger } from './core/logger.js';
import { createDb, dbReadiness } from './infra/db.js';
import { createDocumentCrypto } from './infra/document-crypto.js';
import { createRedis, redisReadiness } from './infra/redis.js';
import { createObjectStore } from './infra/storage.js';
import { createAccountModule } from './modules/account/index.js';
import { createAuthModule } from './modules/auth/index.js';
import { createCatalogModule } from './modules/catalog/index.js';
import { createMediaModule } from './modules/media/index.js';
import { createMentorsModule } from './modules/mentors/index.js';
import { createMentorApplicationModule } from './modules/mentor-application/index.js';
import { createVerificationModule } from './modules/verification/index.js';

const SHUTDOWN_GRACE_MS = 10_000;

function readConfig(): Config {
  try {
    return loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      // No logger yet — the config decides its level. stderr is collected by Docker.
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

function main() {
  const config = readConfig();
  const logger = createLogger(config);
  const db = createDb({ url: config.databaseUrl, poolMax: config.databasePoolMax, logger });
  const redis = createRedis(config.redisUrl, logger);
  const store = createObjectStore(config.storage);
  const crypto = createDocumentCrypto(config.documentKeys);
  if (config.appEnv === 'local') {
    // The local S3 gateway starts empty; hosted buckets are created with the infrastructure.
    store.ensureBucket().catch((err: unknown) => logger.error({ err }, 'could not create bucket'));
  }

  const auth = createAuthModule({ config, db, redis, logger });
  const account = createAccountModule({ db, auth });
  const media = createMediaModule({ store });
  const catalog = createCatalogModule({ db, auth, logos: media.logos });
  const mentors = createMentorsModule({ db, auth, avatars: media.avatars });
  const mentorApplication = createMentorApplicationModule({ db, store, crypto, auth });
  const verification = createVerificationModule({ db, store, crypto, auth });

  const app = createApp({
    config,
    logger,
    readinessChecks: [dbReadiness(db, logger), redisReadiness(redis), store.readiness()],
    mountV1: (v1) => {
      auth.mount(v1);
      account.mount(v1);
      media.mount(v1);
      catalog.mount(v1);
      mentors.mount(v1);
      mentorApplication.mount(v1);
      verification.mount(v1);
    },
  });
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'sabeq-api listening');
  });

  // Load balancers keep idle connections ~60s; the server must outlive them to avoid 502s.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 30_000;

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down: finishing in-flight requests');
    server.close(() => {
      void Promise.allSettled([db.$disconnect(), redis.quit()]).then(() => {
        logger.info('server closed');
        process.exit(0);
      });
    });
    server.closeIdleConnections();
    setTimeout(() => {
      logger.error('forced exit after grace period');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // A crashed process is restarted by the orchestrator; log why first.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled promise rejection');
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    process.exit(1);
  });
}

main();
