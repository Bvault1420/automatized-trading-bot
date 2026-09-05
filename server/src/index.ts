import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import { config, ROOT_DIR } from './config.js';
import { router } from './api/routes.js';
import { attachWebSocket } from './api/ws.js';
import { engine } from './trading/engine.js';
import { autoUnlock } from './chain/hot.js';
import { db } from './store/db.js';
import { originAllowed } from './util/origin.js';
import { createLogger } from './util/logger.js';

const log = createLogger('server');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(
  cors({
    origin: (origin, callback) => {
      if (originAllowed(origin)) return callback(null, true);
      callback(new Error('Origin nicht erlaubt'));
    },
  }),
);

app.get('/api/health', (_req, res) => {
  const status = engine.status();
  res.json({
    ok: true,
    uptime: process.uptime(),
    running: status.running,
    shouldRun: db.data.runtime.shouldRun,
    mode: status.mode,
    lastTickAt: status.lastTickAt,
    lastScanAt: status.lastScanAt,
    detached: true,
  });
});
app.use('/api', router);

const webDist = path.join(ROOT_DIR, 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  log.info('Dashboard wird aus web/dist ausgeliefert');
}

const server = http.createServer(app);
attachWebSocket(server);

autoUnlock();
engine.bootstrap();

server.listen(config.port, config.bindHost, () => {
  log.success(`API bereit auf http://${config.bindHost}:${config.port}`);
  log.info(`Handelsmodus: ${db.data.settings.tradingMode.toUpperCase()} · Live-Chain: ${config.chain.name}`);
  if (config.bindHost !== '127.0.0.1' && config.bindHost !== 'localhost') {
    log.warn('API lauscht nicht nur lokal – jeder im Netz kann Wallet-Endpunkte aufrufen');
  }
  if (fs.existsSync(webDist)) log.success(`Dashboard: http://${config.bindHost}:${config.port}`);
});

function shutdown(signal: string): void {
  log.warn(`${signal} empfangen – Bot wird beendet`);
  engine.shutdown();
  db.flush();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  log.error(`Unbehandelte Promise-Ablehnung: ${String(reason)}`);
});
process.on('uncaughtException', (err) => {
  log.error(`Ungefangene Ausnahme – Prozess bleibt am Leben: ${err.message}`);
  db.flush();
});
