import { Router } from 'express';
import { isAddress, type Address } from 'viem';
import { db } from '../store/db.js';
import { botWallet } from '../chain/wallet.js';
import { engine } from '../trading/engine.js';
import { portfolio } from '../trading/portfolio.js';
import { getIntel } from '../intel/index.js';
import { getCandidates } from '../scanner/index.js';
import { recentLogs } from '../util/logger.js';
import { bus } from '../util/bus.js';
import { fullState, walletState } from './state.js';
import type { TradingMode } from '../types.js';

export const router = Router();

const fail = (message: string) => ({ ok: false, message });

router.get('/state', async (_req, res) => {
  res.json(await fullState());
});

router.get('/intel', (_req, res) => res.json(getIntel()));
router.get('/candidates', (_req, res) => res.json(getCandidates()));
router.get('/logs', (req, res) => res.json(recentLogs(Number(req.query.limit ?? 200))));
router.get('/stats', (_req, res) => res.json(portfolio.stats(engine.mode)));
router.get('/settings', (_req, res) => res.json(db.data.settings));

router.post('/bot/start', async (_req, res) => {
  res.json(await engine.start());
});

router.post('/bot/stop', (_req, res) => {
  engine.stop();
  res.json({ ok: true, message: 'Bot gestoppt' });
});

router.post('/bot/panic', async (_req, res) => {
  res.json(await engine.panic());
});

router.post('/bot/mode', async (req, res) => {
  const mode = req.body?.mode as TradingMode;
  if (mode !== 'paper' && mode !== 'live') return res.status(400).json(fail('Ungültiger Modus'));
  const result = await engine.setMode(mode);
  res.status(result.ok ? 200 : 400).json(result);
});

router.patch('/settings', (req, res) => {
  const settings = engine.updateSettings(req.body ?? {});
  res.json({ ok: true, settings });
});

router.post('/positions/:id/close', async (req, res) => {
  const result = await engine.closePosition(req.params.id);
  res.status(result.ok ? 200 : 400).json(result);
});

router.post('/positions/close-all', async (_req, res) => {
  const closed = await engine.closeAll();
  res.json({ ok: true, message: `${closed} Position(en) geschlossen` });
});

router.get('/wallet', async (_req, res) => {
  res.json(await walletState());
});

/** Verbindet die MetaMask-Adresse des Nutzers als Auszahlungsziel. */
router.post('/wallet/owner', async (req, res) => {
  const address = String(req.body?.address ?? '');
  if (!isAddress(address)) return res.status(400).json(fail('Ungültige Adresse'));
  db.update((draft) => {
    draft.wallet.ownerAddress = address;
  });
  const state = await walletState();
  bus.emitEvent('wallet', state);
  res.json({ ok: true, message: 'Wallet verbunden', wallet: state });
});

router.post('/wallet/disconnect', async (_req, res) => {
  db.update((draft) => {
    draft.wallet.ownerAddress = null;
  });
  res.json({ ok: true, message: 'Wallet getrennt', wallet: await walletState() });
});

router.post('/wallet/create', async (req, res) => {
  try {
    const passphrase = String(req.body?.passphrase ?? '');
    const address = botWallet.create(passphrase);
    const state = await walletState();
    bus.emitEvent('wallet', state);
    res.json({ ok: true, message: 'Bot-Wallet erstellt', address, wallet: state });
  } catch (err) {
    res.status(400).json(fail((err as Error).message));
  }
});

router.post('/wallet/unlock', async (req, res) => {
  try {
    botWallet.unlock(String(req.body?.passphrase ?? ''));
    const state = await walletState();
    bus.emitEvent('wallet', state);
    res.json({ ok: true, message: 'Bot-Wallet entsperrt', wallet: state });
  } catch (err) {
    res.status(400).json(fail((err as Error).message));
  }
});

router.post('/wallet/lock', async (_req, res) => {
  botWallet.lock();
  if (engine.mode === 'live') engine.stop('Wallet gesperrt');
  res.json({ ok: true, message: 'Bot-Wallet gesperrt', wallet: await walletState() });
});

/** Zahlt das gesamte Guthaben an die verbundene MetaMask-Adresse aus. */
router.post('/wallet/withdraw', async (req, res) => {
  try {
    const target = (req.body?.to as string) || db.data.wallet.ownerAddress;
    if (!target || !isAddress(target)) return res.status(400).json(fail('Keine gültige Zieladresse'));
    if (portfolio.openPositions('live').length > 0) {
      return res.status(400).json(fail('Es sind noch Live-Positionen offen – bitte zuerst schließen'));
    }
    const hash = await botWallet.withdrawAll(target as Address);
    res.json({ ok: true, message: 'Auszahlung gesendet', txHash: hash });
  } catch (err) {
    res.status(400).json(fail((err as Error).message));
  }
});

/** Notfall-Export: der Nutzer behaelt jederzeit die volle Kontrolle. */
router.post('/wallet/export', (req, res) => {
  try {
    const key = botWallet.exportPrivateKey(String(req.body?.passphrase ?? ''));
    res.json({ ok: true, privateKey: key });
  } catch (err) {
    res.status(400).json(fail((err as Error).message));
  }
});

router.post('/paper/reset', async (req, res) => {
  const balance = Number(req.body?.balance ?? 11);
  if (!Number.isFinite(balance) || balance <= 0) return res.status(400).json(fail('Ungültiger Betrag'));
  if (engine.mode === 'paper') engine.stop('Papierkonto zurückgesetzt');
  portfolio.setPaperCash(balance);
  res.json({ ok: true, message: `Papierkonto auf $${balance} zurückgesetzt`, state: await fullState() });
});

router.post('/blacklist', (req, res) => {
  const key = String(req.body?.key ?? '').toLowerCase();
  if (!key.includes(':')) return res.status(400).json(fail('Format: chain:tokenAdresse'));
  db.update((draft) => {
    if (!draft.blacklist.includes(key)) draft.blacklist.push(key);
  });
  res.json({ ok: true, blacklist: db.data.blacklist });
});

router.delete('/blacklist/:key', (req, res) => {
  const key = req.params.key.toLowerCase();
  db.update((draft) => {
    draft.blacklist = draft.blacklist.filter((k) => k !== key);
  });
  res.json({ ok: true, blacklist: db.data.blacklist });
});
