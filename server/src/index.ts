import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import { config, ROOT_DIR } from './config.js';
import { router } from './api/routes.js';
import { attachWebSocket } from './api/ws.js';
import { engine } from './trading/engine.js';
import { autoUnlock } from './chain/wallet.js';
import { db } from './store/db.js';
import { createLogger } from './util/logger.js';

const log = createLogger('server');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: (origin, callback) => {
      // Ohne Origin (curl, native Clients) und lokale Dashboards immer erlauben.
      if (!origin || config.corsOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
        return callback(null, true);
      }
      callback(new Error('Origin nicht erlaubt'));
    },
  }),
);

app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.use('/api', router);

// Im Produktivbetrieb liefert derselbe Prozess auch das gebaute Dashboard aus.
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

server.listen(config.port, () => {
  log.success(`API bereit auf http://localhost:${config.port}`);
  log.info(`Handelsmodus: ${db.data.settings.tradingMode.toUpperCase()} · Live-Chain: ${config.chain.name}`);
  if (fs.existsSync(webDist)) log.success(`Dashboard: http://localhost:${config.port}`);
});

function shutdown(signal: string): void {
  log.warn(`${signal} empfangen – Bot wird beendet`);
  // Bewusst ohne engine.stop(): der gespeicherte Laufzustand bleibt erhalten,
  // damit der Handel nach einem Neustart selbsttaetig weiterlaeuft.
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
