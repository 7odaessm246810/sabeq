/**
 * Process entry point: load config, build the app, listen, shut down cleanly.
 */
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config/env.js';
import { createLogger } from './core/logger.js';

const SHUTDOWN_GRACE_MS = 10_000;

function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      // No logger yet — the config decides its level. stderr is collected by Docker.
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const logger = createLogger(config);
  const app = createApp({ config, logger });
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
      logger.info('server closed');
      process.exit(0);
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
