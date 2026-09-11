import { WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import { bus } from '../util/bus.js';
import { engine } from '../trading/engine.js';

export function attachWs(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'state', payload: engine.dashboard(), t: Date.now() }));
  });

  bus.on('event', (evt) => {
    const raw = JSON.stringify(evt);
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(raw);
    }
  });
}
