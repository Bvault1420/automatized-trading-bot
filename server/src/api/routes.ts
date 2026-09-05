import { Router } from 'express';
import { isAddress } from 'viem';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { db } from '../store/db.js';
import { hotWallet, isSolanaChain } from '../chain/hot.js';
import { engine } from '../trading/engine.js';
import { portfolio } from '../trading/portfolio.js';
import { getIntel } from '../intel/index.js';
import { getCandidates } from '../scanner/index.js';
import { recentLogs } from '../util/logger.js';
import { bus } from '../util/bus.js';
import { clientKey, delay, rateLimited } from '../util/rateLimit.js';
import { fullState, walletState } from './state.js';
import { acceptedTokens, sweepToNative } from '../chain/deposits.js';
import { nativePriceUsd } from '../chain/prices.js';
import {
  TOKEN_PROGRAM_ID,
  USDC_MINT,
  USDT_MINT,
  buildSolTransfer,
  buildSplTransfer,
  isSolanaAddress,
} from '../chain/solana.js';
import { solanaWallet } from '../chain/solanaWallet.js';
import type { TradingMode } from '../types.js';

export const router = Router();

const fail = (message: string) => ({ ok: false, message });

function isOwnerAddress(address: string): boolean {
  return isSolanaChain() ? isSolanaAddress(address) : isAddress(address);
}

function gated(req: { ip?: string; socket?: { remoteAddress?: string } }, action: string, max = 8): string | null {
  if (rateLimited(`${action}:${clientKey(req)}`, max, 10 * 60_000)) {
    return 'Zu viele Versuche – bitte ein paar Minuten warten';
  }
  return null;
}

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

router.post('/bot/resume', async (_req, res) => {
  res.json(await engine.resume());
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

/** Verbindet Phantom (Solana) oder MetaMask (EVM) als Auszahlungsziel. */
router.post('/wallet/owner', async (req, res) => {
  const address = String(req.body?.address ?? '');
  if (!isOwnerAddress(address)) {
    return res.status(400).json(fail(isSolanaChain() ? 'Ungültige Solana-Adresse' : 'Ungültige Adresse'));
  }
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
  const limited = gated(req, 'wallet-create', 6);
  if (limited) return res.status(429).json(fail(limited));
  try {
    const passphrase = String(req.body?.passphrase ?? '');
    const address = hotWallet.create(passphrase);
    const state = await walletState();
    bus.emitEvent('wallet', state);
    res.json({ ok: true, message: 'Bot-Wallet erstellt', address, wallet: state });
  } catch (err) {
    res.status(400).json(fail((err as Error).message));
  }
});

router.post('/wallet/unlock', async (req, res) => {
  const limited = gated(req, 'wallet-unlock', 8);
  if (limited) return res.status(429).json(fail(limited));
  try {
    hotWallet.unlock(String(req.body?.passphrase ?? ''));
    const state = await walletState();
    bus.emitEvent('wallet', state);
    res.json({ ok: true, message: 'Bot-Wallet entsperrt', wallet: state });
  } catch (err) {
    await delay(400);
    res.status(400).json(fail((err as Error).message));
  }
});

router.post('/wallet/lock', async (_req, res) => {
  hotWallet.lock();
  if (engine.mode === 'live') engine.stop('Wallet gesperrt');
  res.json({ ok: true, message: 'Bot-Wallet gesperrt', wallet: await walletState() });
});

/** Zahlt das gesamte Guthaben an die verbundene Owner-Adresse aus. */
router.post('/wallet/withdraw', async (req, res) => {
  try {
    const limited = gated(req, 'wallet-withdraw', 6);
    if (limited) return res.status(429).json(fail(limited));
    hotWallet.verifyPassphrase(String(req.body?.passphrase ?? ''));
    const target = (req.body?.to as string) || db.data.wallet.ownerAddress;
    if (!target || !isOwnerAddress(target)) {
      return res.status(400).json(fail(isSolanaChain() ? 'Keine gültige Solana-Adresse' : 'Keine gültige Zieladresse'));
    }
    if (hotWallet.address && target === hotWallet.address) {
      return res.status(400).json(fail('Auszahlung an das Bot-Wallet selbst ist nicht möglich'));
    }
    if (portfolio.openPositions('live').length > 0) {
      return res.status(400).json(fail('Es sind noch Live-Positionen offen – bitte zuerst schließen'));
    }
    if (!hotWallet.unlocked) {
      return res.status(400).json(fail('Bot-Wallet ist gesperrt'));
    }
    const hash = await hotWallet.withdrawAll(target);
    res.json({ ok: true, message: 'Auszahlung gesendet', txHash: hash });
  } catch (err) {
    await delay(300);
    res.status(400).json(fail((err as Error).message));
  }
});

router.post('/wallet/export', (req, res) => {
  const limited = gated(req, 'wallet-export', 5);
  if (limited) return res.status(429).json(fail(limited));
  try {
    const key = hotWallet.exportSecret(String(req.body?.passphrase ?? ''));
    res.json({ ok: true, privateKey: key });
  } catch (err) {
    res.status(400).json(fail((err as Error).message));
  }
});

router.post('/wallet/passphrase', async (req, res) => {
  const limited = gated(req, 'wallet-passphrase', 6);
  if (limited) return res.status(429).json(fail(limited));
  try {
    hotWallet.changePassphrase(String(req.body?.current ?? ''), String(req.body?.next ?? ''));
    const state = await walletState();
    bus.emitEvent('wallet', state);
    res.json({ ok: true, message: 'Passphrase geändert', wallet: state });
  } catch (err) {
    await delay(400);
    res.status(400).json(fail((err as Error).message));
  }
});

router.post('/wallet/reset', async (req, res) => {
  const limited = gated(req, 'wallet-reset', 4);
  if (limited) return res.status(429).json(fail(limited));
  try {
    if (String(req.body?.confirm ?? '') !== 'LÖSCHEN') {
      return res.status(400).json(fail('Zum Löschen musst du LÖSCHEN bestätigen'));
    }
    if (portfolio.openPositions('live').length > 0) {
      return res.status(400).json(fail('Zuerst alle Live-Positionen schließen'));
    }
    if (engine.mode === 'live') engine.stop('Wallet gelöscht');
    hotWallet.lock();
    hotWallet.reset();
    const state = await walletState();
    bus.emitEvent('wallet', state);
    res.json({ ok: true, message: 'Bot-Wallet gelöscht – du kannst ein neues erstellen', wallet: state });
  } catch (err) {
    res.status(400).json(fail((err as Error).message));
  }
});

router.post('/wallet/sweep', async (_req, res) => {
  try {
    const result = await sweepToNative();
    const state = await walletState();
    bus.emitEvent('wallet', state);
    const message =
      result.converted > 0
        ? `${result.converted} Token-Guthaben in ${state.nativeSymbol} umgewandelt`
        : result.messages[0] ?? 'Nichts umzuwandeln';
    res.json({ ok: true, message, wallet: state, details: result.messages });
  } catch (err) {
    res.status(400).json(fail((err as Error).message));
  }
});

/**
 * Baut eine unsignierte Solana-Transaktion, mit der Phantom SOL/USDC/USDT
 * an das Bot-Wallet schickt. Phantom signiert im Browser.
 */
router.post('/wallet/prepare-deposit', async (req, res) => {
  try {
    if (!isSolanaChain()) return res.status(400).json(fail('Einzahlungs-Transaktionen gibt es nur auf Solana'));
    const from = String(req.body?.from ?? '');
    const symbol = String(req.body?.symbol ?? 'SOL').toUpperCase();
    const amountEur = Number(req.body?.amountEur ?? 0);
    if (!isSolanaAddress(from)) return res.status(400).json(fail('Ungültige Phantom-Adresse'));
    if (!Number.isFinite(amountEur) || amountEur <= 0) return res.status(400).json(fail('Ungültiger Betrag'));
    if (amountEur > 5_000) return res.status(400).json(fail('Einzahlungsbetrag ist zu hoch'));
    const bot = solanaWallet.address;
    if (!bot) return res.status(400).json(fail('Zuerst ein Bot-Wallet erstellen'));

    const fromKey = new PublicKey(from);
    const toKey = new PublicKey(bot);
    let tx;
    if (symbol === 'SOL') {
      const solPrice = await nativePriceUsd('SOL');
      if (solPrice <= 0) return res.status(400).json(fail('SOL-Preis nicht verfügbar'));
      const lamports = BigInt(Math.round((amountEur / solPrice) * LAMPORTS_PER_SOL));
      if (lamports <= 0n) return res.status(400).json(fail('Betrag zu klein'));
      tx = await buildSolTransfer(fromKey, toKey, lamports);
    } else {
      const meta = acceptedTokens().find((t) => t.symbol === symbol);
      if (!meta) return res.status(400).json(fail('Dieses Token wird nicht akzeptiert'));
      const raw = BigInt(Math.round(amountEur * 10 ** meta.decimals));
      if (raw <= 0n) return res.status(400).json(fail('Betrag zu klein'));
      const mint = symbol === 'USDT' ? USDT_MINT : USDC_MINT;
      tx = await buildSplTransfer({
        from: fromKey,
        to: toKey,
        mint: new PublicKey(mint),
        amount: raw,
        programId: TOKEN_PROGRAM_ID,
      });
    }

    res.json({
      ok: true,
      transaction: Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64'),
    });
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
