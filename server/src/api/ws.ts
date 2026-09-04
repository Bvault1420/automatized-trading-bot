import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { bus } from '../util/bus.js';
import { createLogger } from '../util/logger.js';
import { fullState } from './state.js';

const log = createLogger('ws');

/**
 * Push-Kanal fuer das Dashboard. Der Bot erzeugt Ereignisse im Sekundentakt –
 * Polling waere sowohl langsamer als auch deutlich teurer.
 */
export function attachWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (socket: WebSocket) => {
    log.debug(`Dashboard verbunden (${wss.clients.size} aktiv)`);
    try {
      socket.send(JSON.stringify({ type: 'snapshot', payload: await fullState() }));
    } catch {
      // Verbindung kann waehrend des Aufbaus abbrechen – unkritisch.
    }
    socket.on('close', () => log.debug(`Dashboard getrennt (${wss.clients.size} aktiv)`));
    socket.on('error', () => socket.terminate());
  });

  const forward = (event: { type: string; payload: unknown }) => {
    if (wss.clients.size === 0) return;
    const message = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(message);
    }
  };
  bus.on('*', forward);

  // Heartbeat: tote Verbindungen entfernen, damit Broadcasts schnell bleiben.
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState !== 1) client.terminate();
    }
  }, 30_000);

  wss.on('close', () => {
    clearInterval(heartbeat);
    bus.off('*', forward);
  });

  return wss;
}
