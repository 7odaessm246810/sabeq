/**
 * Phase 02 skeleton: just enough of the API for containers, health checks and the web proxy to work.
 * Phase 05 replaces this with the real foundation (config, logging, errors, security, /api/v1 modules).
 */
import { PLATFORM } from '@sabeq/types';
import express from 'express';

const port = Number(process.env.API_PORT ?? 4000);
const startedAt = new Date();

const app = express();
app.disable('x-powered-by');

/** Liveness: the process is up. Used by Docker HEALTHCHECK and load balancers. */
app.get('/health/live', (_req, res) => {
  res.json({ status: 'ok' });
});

/** Readiness: dependencies are reachable. Database and Redis checks are added in Phase 05–06. */
app.get('/health/ready', (_req, res) => {
  res.json({ status: 'ok', checks: {}, uptimeSeconds: Math.round(process.uptime()) });
});

app.get(`/api/${PLATFORM.apiVersion}`, (_req, res) => {
  res.json({ data: { name: 'sabeq-api', version: PLATFORM.apiVersion, startedAt } });
});

const server = app.listen(port, () => {
  process.stdout.write(`sabeq-api listening on :${port}\n`);
});

/** Containers are stopped with SIGTERM; finish in-flight requests before exiting. */
function shutdown(signal: string) {
  process.stdout.write(`${signal} received, closing server\n`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
