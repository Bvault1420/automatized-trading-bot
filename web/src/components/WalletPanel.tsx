import { useEffect, useState } from 'react';
import { Transaction } from '@solana/web3.js';
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
import type { DepositAsset, WalletState } from '../lib/types';

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
    solana?: PhantomProvider;
    phantom?: { solana?: PhantomProvider };
  }
}

function getPhantom(): PhantomProvider | null {
  const provider = window.phantom?.solana ?? window.solana;
  if (!provider?.isPhantom) return null;
  return provider;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function erc20TransferData(to: string, amount: bigint): string {
  const selector = 'a9059cbb';
  const addr = to.replace(/^0x/i, '').toLowerCase().padStart(64, '0');
  const amt = amount.toString(16).padStart(64, '0');
  return `0x${selector}${addr}${amt}`;
}

function tokenAmountFromEur(asset: DepositAsset, eur: number): bigint {
  const price = asset.kind === 'stable' ? 1 : asset.priceUsd;
  if (price <= 0) throw new Error(`Preis für ${asset.symbol} nicht verfügbar`);
  const tokens = eur / price;
  const raw = BigInt(Math.round(tokens * 10 ** asset.decimals));
  if (raw <= 0n) throw new Error('Betrag zu klein');
  return raw;
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
  const solana = wallet.family === 'solana';
  const walletName = solana ? 'Phantom' : 'MetaMask';
  const [busy, setBusy] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [copied, setCopied] = useState(false);
  const [depositEur, setDepositEur] = useState('10');
  const [depositSymbol, setDepositSymbol] = useState(wallet.nativeSymbol || (solana ? 'SOL' : 'ETH'));

  useEffect(() => {
    setDepositSymbol((prev) => {
      const assets = wallet.assets ?? [];
      if (assets.some((asset) => asset.symbol === prev)) return prev;
      return wallet.nativeSymbol;
    });
  }, [wallet.nativeSymbol, wallet.assets]);

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

  const connectOwner = async () => {
    if (solana) {
      const phantom = getPhantom();
      if (!phantom) {
        onNotify('Phantom wurde nicht gefunden. Bitte Erweiterung installieren.', false);
        return;
      }
      setBusy('connect');
      try {
        const session = await phantom.connect();
        const address = session.publicKey.toString();
        const result = await api.connectOwner(address);
        onNotify(result.message, true);
        await onRefresh();
      } catch (err) {
        onNotify((err as Error).message, false);
      } finally {
        setBusy(null);
      }
      return;
    }

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
    onNotify(
      solana
        ? 'Adresse kopiert – jetzt SOL oder USDC auf Solana dorthin senden'
        : 'Adresse kopiert – jetzt ETH auf Base dorthin senden',
      true,
    );
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

  const depositFromOwner = async () => {
    if (!wallet.botAddress) {
      onNotify('Zuerst ein Bot-Wallet erstellen', false);
      return;
    }
    const eur = Number(depositEur.replace(',', '.'));
    if (!Number.isFinite(eur) || eur <= 0) {
      onNotify('Ungültiger Betrag', false);
      return;
    }

    if (solana) {
      const phantom = getPhantom();
      if (!phantom) {
        onNotify('Phantom nicht gefunden', false);
        return;
      }
      setBusy('deposit');
      try {
        const session = await phantom.connect();
        const from = session.publicKey.toString();
        const prepared = await api.prepareDeposit(from, depositSymbol, eur);
        const tx = Transaction.from(decodeBase64(prepared.transaction));
        const { signature } = await phantom.signAndSendTransaction(tx);
        onNotify(`${depositSymbol}-Einzahlung gesendet – ${signature.slice(0, 10)}…`, true);
        await onRefresh();
      } catch (err) {
        onNotify((err as Error).message, false);
      } finally {
        setBusy(null);
      }
      return;
    }

    if (!window.ethereum) {
      onNotify('MetaMask nicht gefunden', false);
      return;
    }
    const assets = wallet.assets ?? [];
    const asset =
      depositSymbol === 'ETH' || depositSymbol === wallet.nativeSymbol
        ? assets.find((a) => a.kind === 'native')
        : assets.find((a) => a.symbol === depositSymbol);
    if (!asset) {
      onNotify('Dieses Token ist gerade nicht verfügbar', false);
      return;
    }
    setBusy('deposit');
    try {
      await ensureBaseChain();
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      const from = accounts[0];
      if (!from) throw new Error('Keine MetaMask-Adresse');

      if (asset.kind === 'native') {
        const wei = tokenAmountFromEur({ ...asset, priceUsd: wallet.nativePriceUsd || asset.priceUsd }, eur);
        const hash = (await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{ from, to: wallet.botAddress, value: `0x${wei.toString(16)}` }],
        })) as string;
        onNotify(`Einzahlung gesendet (${Number(wei) / 1e18} ETH) – ${hash.slice(0, 10)}…`, true);
      } else {
        if (!asset.address) throw new Error('Token-Adresse fehlt');
        const raw = tokenAmountFromEur(asset, eur);
        const hash = (await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from,
              to: asset.address,
              value: '0x0',
              data: erc20TransferData(wallet.botAddress, raw),
            },
          ],
        })) as string;
        onNotify(`${asset.symbol}-Einzahlung gesendet – ${hash.slice(0, 10)}…`, true);
      }
      await onRefresh();
    } catch (err) {
      onNotify((err as Error).message, false);
    } finally {
      setBusy(null);
    }
  };

  const assets = wallet.assets ?? [];
  const gasDust = solana ? 0.002 : 0.00025;
  const deposited = (wallet.totalUsd ?? 0) >= 1 || wallet.nativeBalance > gasDust;
  const steps = [
    { done: wallet.hasKeystore, label: 'Bot-Wallet erstellt' },
    { done: wallet.unlocked, label: 'Wallet entsperrt' },
    { done: deposited, label: `Guthaben auf ${wallet.chain} eingezahlt` },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  const selectedAsset =
    assets.find((a) => a.symbol === depositSymbol) ?? assets.find((a) => a.kind === 'native');
  const eurNum = Number(depositEur.replace(',', '.'));
  const previewAmount =
    selectedAsset && eurNum > 0
      ? eurNum / (selectedAsset.kind === 'stable' ? 1 : selectedAsset.priceUsd || wallet.nativePriceUsd)
      : 0;
  const sendChoices = assets.filter((a) => a.kind === 'native' || a.kind === 'stable' || a.kind === 'btc');
  if (sendChoices.length === 0) {
    sendChoices.push({
      symbol: wallet.nativeSymbol,
      name: wallet.nativeSymbol,
      address: null,
      decimals: solana ? 9 : 18,
      kind: 'native',
      balance: wallet.nativeBalance,
      balanceUsd: wallet.nativeBalanceUsd,
      priceUsd: wallet.nativePriceUsd,
    });
  }

  const intro = solana
    ? 'Phantom kann nicht vollautomatisch handeln, deshalb bekommt der Bot ein eigenes Solana-Wallet. Du zahlst dort SOL oder USDC auf Solana ein – der Bot wandelt USDC selbst in SOL um und tradet Memecoins über Jupiter. Native Bitcoin oder ETH-Mainnet kommen an dieser Adresse nicht an.'
    : `MetaMask kann nicht vollautomatisch handeln, deshalb bekommt der Bot ein eigenes Wallet. Du kannst dort auf ${wallet.chain} ETH, USDC, USDT, DAI oder cbBTC einzahlen – der Bot wandelt andere Coins selbst in ETH um. Native Bitcoin oder Solana kommen an dieser Adresse nicht an.`;

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
        {intro} Live-Chain ist <strong className="text-slate-300">{wallet.chain}</strong>.
      </p>

      <details className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-slate-300">Was ist die Passphrase?</summary>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          Die Passphrase ist <strong className="text-slate-300">kein</strong> Seed und kein Börsenpasswort. Du vergibst
          sie selbst, wenn du das Bot-Wallet erstellst. Damit wird der private Schlüssel auf diesem Rechner verschlüsselt.
          Nach jedem Server-Neustart musst du sie eingeben, sonst kann der Bot keine Transaktion signieren. Wer sie kennt,
          kann das Wallet entsperren – also notieren und niemandem schicken. Verloren = Bot kann den Schlüssel nicht
          mehr entschlüsseln (Export vorher ist die Rettung).
        </p>
      </details>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Auszahlungsziel ({walletName})
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
            onClick={() => void connectOwner()}
            disabled={busy === 'connect'}
          >
            {busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            {walletName} verbinden
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
              placeholder="Passphrase (mind. 8 Zeichen, selbst vergeben)"
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
                Einzahlen auf {wallet.chain}
              </div>
              <p className="text-[10px] leading-relaxed text-slate-400">
                {solana ? (
                  <>
                    Gleiche Adresse für SOL, USDC und USDT. Netzwerk muss{' '}
                    <span className="font-semibold text-slate-200">Solana</span> sein – nicht Ethereum, nicht Base,
                    nicht Bitcoin-Mainnet.
                  </>
                ) : (
                  <>
                    Gleiche Adresse für ETH, USDC, USDT, DAI und cbBTC. Netzwerk muss{' '}
                    <span className="font-semibold text-slate-200">{wallet.chain}</span> sein – nicht Bitcoin-Mainnet,
                    nicht Ethereum-Mainnet, nicht Solana.
                  </>
                )}
              </p>
              <code className="num block break-all rounded-lg bg-black/40 px-2 py-1.5 text-[10px] text-emerald-200">
                {wallet.botAddress}
              </code>

              {assets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {assets.map((asset) => (
                    <span
                      key={asset.symbol}
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        asset.balanceUsd > 0.01
                          ? 'bg-emerald-500/15 text-emerald-200'
                          : 'bg-black/30 text-slate-500'
                      }`}
                    >
                      {asset.symbol}
                      {asset.balanceUsd > 0.01 ? ` ${usd(asset.balanceUsd)}` : ''}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <select
                  className="input w-28 shrink-0"
                  value={depositSymbol}
                  onChange={(event) => setDepositSymbol(event.target.value)}
                >
                  {sendChoices.map((asset) => (
                    <option key={asset.symbol} value={asset.symbol}>
                      {asset.symbol}
                    </option>
                  ))}
                </select>
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
              </div>
              <button
                type="button"
                className="btn-primary w-full"
                disabled={busy === 'deposit' || !wallet.botAddress}
                onClick={() => void depositFromOwner()}
              >
                {busy === 'deposit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                {depositSymbol} aus {walletName} senden
              </button>
              {previewAmount > 0 && selectedAsset && (
                <p className="text-[10px] text-slate-500">
                  ≈ {previewAmount < 0.01 ? previewAmount.toFixed(6) : previewAmount.toFixed(4)} {selectedAsset.symbol}
                  {selectedAsset.kind === 'btc' ? ' (Bitcoin als cbBTC auf Base, nicht natives BTC)' : ''}
                </p>
              )}
              {(wallet.tokenUsd ?? 0) >= 0.5 && wallet.unlocked && (
                <button
                  type="button"
                  className="btn-ghost w-full"
                  disabled={busy === 'sweep'}
                  onClick={() => void run('sweep', api.sweep)}
                >
                  {busy === 'sweep' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Tokens jetzt in {wallet.nativeSymbol} umwandeln
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="btn-ghost flex-1"
                disabled={!wallet.ownerAddress || !wallet.unlocked || busy === 'withdraw'}
                onClick={() => void run('withdraw', () => api.withdraw())}
                title={!wallet.ownerAddress ? `Zuerst ${walletName} verbinden` : 'Gesamtes Guthaben auszahlen'}
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
