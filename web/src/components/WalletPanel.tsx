import { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Circle,
  CheckCircle2,
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

const BASE_CHAIN = {
  chainId: '0x2105',
  chainName: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://mainnet.base.org'],
  blockExplorerUrls: ['https://basescan.org'],
};

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
  const [depositEur, setDepositEur] = useState('10');

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
    onNotify('Adresse kopiert – jetzt ETH auf Base dorthin senden', true);
    setTimeout(() => setCopied(false), 1800);
  };

  const ensureBaseChain = async () => {
    if (!window.ethereum) throw new Error('MetaMask nicht gefunden');
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_CHAIN.chainId }],
      });
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 4902) {
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [BASE_CHAIN] });
      } else {
        throw err;
      }
    }
  };

  /** Zahlt aus dem verbundenen MetaMask direkt auf das Bot-Wallet ein. */
  const depositFromMetaMask = async () => {
    if (!window.ethereum) {
      onNotify('MetaMask nicht gefunden', false);
      return;
    }
    if (!wallet.botAddress) {
      onNotify('Zuerst ein Bot-Wallet erstellen', false);
      return;
    }
    const eur = Number(depositEur.replace(',', '.'));
    if (!Number.isFinite(eur) || eur <= 0) {
      onNotify('Ungültiger Betrag', false);
      return;
    }
    if (wallet.nativePriceUsd <= 0) {
      onNotify('ETH-Preis gerade nicht verfügbar – bitte in ein paar Sekunden erneut versuchen', false);
      return;
    }
    setBusy('deposit');
    try {
      await ensureBaseChain();
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      const from = accounts[0];
      if (!from) throw new Error('Keine MetaMask-Adresse');
      const ethAmount = eur / wallet.nativePriceUsd;
      const wei = BigInt(Math.round(ethAmount * 1e18));
      if (wei <= 0n) throw new Error('Betrag zu klein');
      const hash = (await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from, to: wallet.botAddress, value: `0x${wei.toString(16)}` }],
      })) as string;
      onNotify(`Einzahlung gesendet (${ethAmount.toFixed(5)} ETH) – ${hash.slice(0, 10)}…`, true);
      await onRefresh();
    } catch (err) {
      onNotify((err as Error).message, false);
    } finally {
      setBusy(null);
    }
  };

  const funded = wallet.nativeBalance > 0.00025;
  const steps = [
    { done: wallet.hasKeystore, label: 'Bot-Wallet erstellt' },
    { done: wallet.unlocked, label: 'Wallet entsperrt' },
    { done: funded, label: `ETH auf ${wallet.chain} eingezahlt` },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  const ethForEur =
    wallet.nativePriceUsd > 0 && Number(depositEur.replace(',', '.')) > 0
      ? Number(depositEur.replace(',', '.')) / wallet.nativePriceUsd
      : 0;

  return (
    <Card
      title="Echtgeld einrichten"
      icon={<Wallet className="h-3.5 w-3.5" />}
      action={
        wallet.liveReady ? (
          <Chip tone="emerald">bereit</Chip>
        ) : (
          <Chip tone="amber">{remaining} Schritt{remaining === 1 ? '' : 'e'} offen</Chip>
        )
      }
      bodyClassName="p-5 space-y-4"
    >
      <div id="wallet-panel" className="space-y-1.5">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center gap-2 text-xs">
            {step.done ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Circle className="h-3.5 w-3.5 text-slate-600" />
            )}
            <span className={step.done ? 'text-slate-400' : 'text-slate-200'}>{step.label}</span>
          </div>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        MetaMask kann nicht vollautomatisch handeln – jede Transaktion müsste manuell bestätigt werden.
        Deshalb bekommt der Bot ein eigenes Wallet. Du zahlst dort ETH auf <strong className="text-slate-300">{wallet.chain}</strong> ein
        (z. B. 10 €), und der Bot tradet damit selbstständig. Auszahlen geht jederzeit zurück an dein MetaMask.
      </p>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Auszahlungsziel (MetaMask)
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
      </div>

      <div className="h-px bg-white/[0.06]" />

      <div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Handelswallet</span>
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
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
              <div className="min-w-0">
                <div className="num truncate text-xs text-slate-300">{shortAddress(wallet.botAddress)}</div>
                <div className="num text-[10px] text-slate-600">
                  {wallet.nativeBalance.toFixed(6)} {wallet.nativeSymbol} · {usd(wallet.nativeBalanceUsd)}
                </div>
              </div>
              <button type="button" onClick={() => void copyAddress()} className="text-slate-500 hover:text-slate-300">
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            {!wallet.unlocked && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-amber-300">Nach jedem Server-Neustart muss das Wallet entsperrt werden.</p>
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
                    className="btn-primary shrink-0"
                    disabled={!passphrase || busy === 'unlock'}
                    onClick={() =>
                      void run('unlock', () => api.unlockWallet(passphrase)).then(() => setPassphrase(''))
                    }
                  >
                    {busy === 'unlock' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
                    Entsperren
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                <ArrowDownToLine className="h-3.5 w-3.5" />
                ETH auf {wallet.chain} einzahlen
              </div>
              <p className="text-[10px] leading-relaxed text-slate-400">
                Wichtig: Netzwerk <span className="font-semibold text-slate-200">{wallet.chain}</span>, nicht Ethereum
                Mainnet. Sonst kommt das Geld nicht an.
              </p>
              <code className="num block break-all rounded-lg bg-black/40 px-2 py-1.5 text-[10px] text-emerald-200">
                {wallet.botAddress}
              </code>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className="input pr-10"
                    value={depositEur}
                    onChange={(event) => setDepositEur(event.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-500">
                    €
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-primary shrink-0"
                  disabled={busy === 'deposit' || !wallet.botAddress}
                  onClick={() => void depositFromMetaMask()}
                >
                  {busy === 'deposit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                  Aus MetaMask
                </button>
              </div>
              {ethForEur > 0 && (
                <p className="text-[10px] text-slate-500">
                  ≈ {ethForEur.toFixed(5)} {wallet.nativeSymbol} bei {usd(wallet.nativePriceUsd, 0)}/{wallet.nativeSymbol}
                </p>
              )}
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

      {wallet.liveReady ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-emerald-200">
          Echtgeld ist bereit. Oben auf <strong>Echtgeld</strong> umschalten, dann den Bot starten – ab dann werden
          echte Swaps auf {wallet.chain} ausgeführt.
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
          <div className="text-[11px] font-semibold text-amber-300">Darum ist Echtgeld noch gesperrt</div>
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
