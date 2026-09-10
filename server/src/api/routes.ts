import express from 'express';
import { engine } from '../trading/engine.js';
import { db } from '../store/db.js';
import { config } from '../config.js';
import { accessInfo } from '../util/access.js';

export function apiRouter(): express.Router {
  const r = express.Router();

  r.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'aegis', ts: Date.now() });
  });

  r.get('/access', (_req, res) => {
    res.json(accessInfo());
  });

  r.get('/state', (_req, res) => {
    res.json(engine.dashboard());
  });

  r.post('/start', async (_req, res) => {
    res.json(await engine.start(false));
  });

  r.post('/stop', (req, res) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'Manuell gestoppt';
    res.json(engine.stop(reason));
  });

  r.post('/mode', async (req, res) => {
    const mode = req.body?.mode;
    if (mode !== 'paper' && mode !== 'live') {
      res.status(400).json({ ok: false, message: 'Modus muss paper oder live sein' });
      return;
    }
    res.json(await engine.setMode(mode));
  });

  r.post('/live-arm', (req, res) => {
    const armed = Boolean(req.body?.armed);
    if (armed && config.liveUnlock && req.body?.unlock !== config.liveUnlock) {
      res.status(403).json({ ok: false, message: 'Live-Passwort falsch' });
      return;
    }
    res.json(engine.armLive(armed));
  });

  r.post('/settings', (req, res) => {
    const patch = req.body ?? {};
    const allowed = [
      'emailEveryTrade',
      'alertEmail',
      'allowStocks',
      'allowCrypto',
      'allowShorts',
    ] as const;
    const next: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in patch) next[key] = patch[key];
    }
    res.json({ ok: true, settings: engine.patchSettings(next as Record<string, unknown>) });
  });

  r.post('/reset-paper', (_req, res) => {
    res.json(engine.resetPaper());
  });

  r.get('/rules', (_req, res) => {
    res.json({ rules: db.data.rules, changes: db.data.ruleChanges.slice(-20) });
  });

  return r;
}
