import { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Copy,
  Check,
  KeyRound,
  Loader2,
  Lock,
  LockOpen,
  Wallet,
} from 'lucide-react';
import { Card, Chip } from './ui';
import { api } from '../lib/api';
import { shortAddress, usd } from '../lib/format';
import type { WalletState } from '../lib/types';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}

export function WalletPanel({
  wallet,
  onNotify,
  onRefresh,
}: {
  wallet: WalletState;
  onNotify: (message: string, ok?: boolean) => void;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [copied, setCopied] = useState(false);

  const run = async (key: string, action: () => Promise<{ message: string }>) => {
    setBusy(key);
    try {
      const result = await action();
      onNotify(result.message, true);
      await onRefresh();
    } catch (err) {
      onNotify((err as Error).message, false);
    } finally {
      setBusy(null);
    }
  };

  /** MetaMask dient als Identitaet und Auszahlungsziel, nicht als Handelskonto. */
  const connectMetaMask = async () => {
    if (!window.ethereum) {
      onNotify('MetaMask wurde nicht gefunden. Bitte Erweiterung installieren.', false);
      return;
    }
    setBusy('connect');
    try {
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      if (!accounts?.length) throw new Error('Keine Adresse freigegeben');
      const result = await api.connectOwner(accounts[0]);
      onNotify(result.message, true);
      await onRefresh();
    } catch (err) {
      onNotify((err as Error).message, false);
    } finally {
      setBusy(null);
    }
  };

  const copyAddress = async () => {
    if (!wallet.botAddress) return;
    await navigator.clipboard.writeText(wallet.botAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Card title="Wallet" icon={<Wallet className="h-3.5 w-3.5" />} bodyClassName="p-5 space-y-4">
      {/* Schritt 1: MetaMask verbinden */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            1 · Dein MetaMask
          </span>
          {wallet.ownerAddress && <Chip tone="emerald">verbunden</Chip>}
        </div>
        {wallet.ownerAddress ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
            <span className="num text-xs text-slate-300">{shortAddress(wallet.ownerAddress)}</span>
            <button
              type="button"
              className="text-[11px] font-semibold text-slate-500 hover:text-rose-300"
              onClick={() => void run('disconnect', api.disconnectOwner)}
            >
              trennen
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-ghost mt-2 w-full"
            onClick={() => void connectMetaMask()}
            disabled={busy === 'connect'}
          >
            {busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            MetaMask verbinden
          </button>
        )}
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-600">
          Dient als Ziel für Auszahlungen. Der Bot erhält dadurch keinen Zugriff auf dein MetaMask.
        </p>
      </div>

      <div className="h-px bg-white/[0.06]" />

      {/* Schritt 2: Handelswallet des Bots */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            2 · Handelswallet des Bots
          </span>
          {wallet.hasKeystore &&
            (wallet.unlocked ? (
              <Chip tone="emerald">
                <LockOpen className="h-3 w-3" />
                entsperrt
              </Chip>
            ) : (
              <Chip tone="amber">
                <Lock className="h-3 w-3" />
                gesperrt
              </Chip>
            ))}
        </div>

        {!wallet.hasKeystore ? (
          <div className="mt-2 space-y-2">
            <input
              type="password"
              className="input"
              placeholder="Passphrase (mind. 8 Zeichen)"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
            <button
              type="button"
              className="btn-primary w-full"
              disabled={passphrase.length < 8 || busy === 'create'}
              onClick={() => void run('create', () => api.createWallet(passphrase)).then(() => setPassphrase(''))}
            >
              {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Bot-Wallet erstellen
            </button>
            <p className="text-[10px] leading-relaxed text-slate-600">
              Der Bot braucht ein eigenes Wallet, weil MetaMask jede Transaktion manuell bestätigen lässt – das
              schließt vollautomatisches Handeln aus. Der Schlüssel wird verschlüsselt lokal gespeichert und kann
              jederzeit exportiert werden.
            </p>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
              <div className="min-w-0">
                <div className="num truncate text-xs text-slate-300">{shortAddress(wallet.botAddress)}</div>
                <div className="num text-[10px] text-slate-600">
                  {wallet.nativeBalance.toFixed(6)} {wallet.nativeSymbol} ·{' '}
                  {usd(wallet.nativeBalanceUsd)}
                </div>
              </div>
              <button type="button" onClick={() => void copyAddress()} className="text-slate-500 hover:text-slate-300">
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            {!wallet.unlocked && (
              <div className="flex gap-2">
                <input
                  type="password"
                  className="input"
                  placeholder="Passphrase"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                />
                <button
                  type="button"
                  className="btn-ghost shrink-0"
                  disabled={!passphrase || busy === 'unlock'}
                  onClick={() =>
                    void run('unlock', () => api.unlockWallet(passphrase)).then(() => setPassphrase(''))
                  }
                >
                  {busy === 'unlock' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
                </button>
              </div>
            )}

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                <ArrowDownToLine className="h-3.5 w-3.5" />
                Einzahlen
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                Sende {wallet.nativeSymbol} auf <span className="text-slate-300">{wallet.chain}</span> an die
                Adresse oben. Etwa 10 € reichen für den Start – ein kleiner Teil bleibt als Gas-Reserve liegen.
              </p>
              <code className="num mt-1.5 block break-all rounded-lg bg-black/40 px-2 py-1.5 text-[10px] text-emerald-200">
                {wallet.botAddress}
              </code>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="btn-ghost flex-1"
                disabled={!wallet.ownerAddress || !wallet.unlocked || busy === 'withdraw'}
                onClick={() => void run('withdraw', () => api.withdraw())}
                title={!wallet.ownerAddress ? 'Zuerst MetaMask verbinden' : 'Gesamtes Guthaben auszahlen'}
              >
                {busy === 'withdraw' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUpFromLine className="h-4 w-4" />
                )}
                Auszahlen
              </button>
              {wallet.unlocked && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void run('lock', api.lockWallet)}
                  disabled={busy === 'lock'}
                >
                  <Lock className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {wallet.liveBlockers.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
          <div className="text-[11px] font-semibold text-amber-300">Echtgeld-Modus noch nicht bereit</div>
          <ul className="mt-1 space-y-0.5">
            {wallet.liveBlockers.map((blocker) => (
              <li key={blocker} className="text-[10px] leading-relaxed text-amber-200/70">
                · {blocker}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
