import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { config, ROOT } from './config.js';
import { allowedOrigin } from './util/origin.js';
import { apiRouter } from './api/routes.js';
import { attachWs } from './api/ws.js';
import { engine } from './trading/engine.js';
import { createLogger } from './util/logger.js';

const log = createLogger('http');
const app = express();

app.use(
  cors({
    origin: (origin, cb) => cb(null, allowedOrigin(origin) ? origin : undefined),
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiRouter());

const webDist = path.join(ROOT, 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

const server = http.createServer(app);
attachWs(server);

server.listen(config.port, config.bindHost, () => {
  log.success(`Aegis lauscht auf http://${config.bindHost}:${config.port}`);
  engine.bootstrap();
});

function shutdown() {
  log.warn('Fahre herunter');
  engine.shutdown();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
