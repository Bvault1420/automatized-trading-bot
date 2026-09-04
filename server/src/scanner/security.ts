import { CHAINS } from '../config.js';
import { getJson } from '../util/http.js';
import { clamp, safeNumber } from '../util/num.js';
import type { SecurityReport } from '../types.js';

const GOPLUS = 'https://api.gopluslabs.io/api/v1';

interface GoPlusEvm {
  is_honeypot?: string;
  cannot_sell_all?: string;
  buy_tax?: string;
  sell_tax?: string;
  is_open_source?: string;
  is_proxy?: string;
  is_mintable?: string;
  can_take_back_ownership?: string;
  owner_change_balance?: string;
  hidden_owner?: string;
  selfdestruct?: string;
  external_call?: string;
  transfer_pausable?: string;
  trading_cooldown?: string;
  slippage_modifiable?: string;
  personal_slippage_modifiable?: string;
  is_blacklisted?: string;
  is_anti_whale?: string;
  holder_count?: string;
  lp_holders?: { is_locked?: number; percent?: string; tag?: string }[];
  holders?: { percent?: string; is_locked?: number }[];
}

const flag = (value: string | undefined): boolean => value === '1';

function unchecked(reason: string): SecurityReport {
  return {
    checked: false,
    ok: true,
    // Ungeprueft ist nicht sicher: 0.55 statt 1.0, damit geprueft-saubere
    // Token im Ranking bevorzugt werden.
    score: 0.55,
    isHoneypot: false,
    buyTaxPct: 0,
    sellTaxPct: 0,
    lpLocked: false,
    isMintable: false,
    isOpenSource: false,
    canTakeBackOwnership: false,
    holderCount: 0,
    top10HolderPct: 0,
    flags: [reason],
    source: 'GoPlus (nicht verfügbar)',
  };
}

function evaluateEvm(data: GoPlusEvm): SecurityReport {
  const flags: string[] = [];
  let score = 1;

  const isHoneypot = flag(data.is_honeypot) || flag(data.cannot_sell_all);
  const buyTaxPct = safeNumber(data.buy_tax) * 100;
  const sellTaxPct = safeNumber(data.sell_tax) * 100;

  if (isHoneypot) {
    flags.push('Honeypot – Verkauf blockiert');
    score = 0;
  }
  if (sellTaxPct > 10) {
    flags.push(`Verkaufssteuer ${sellTaxPct.toFixed(1)}%`);
    score -= 0.5;
  } else if (sellTaxPct > 5) {
    flags.push(`Erhöhte Verkaufssteuer ${sellTaxPct.toFixed(1)}%`);
    score -= 0.2;
  }
  if (buyTaxPct > 10) {
    flags.push(`Kaufsteuer ${buyTaxPct.toFixed(1)}%`);
    score -= 0.3;
  }
  if (flag(data.slippage_modifiable) || flag(data.personal_slippage_modifiable)) {
    flags.push('Steuer nachträglich änderbar');
    score -= 0.3;
  }
  if (flag(data.transfer_pausable)) {
    flags.push('Transfers pausierbar');
    score -= 0.3;
  }
  if (flag(data.is_blacklisted)) {
    flags.push('Blacklist-Funktion vorhanden');
    score -= 0.2;
  }
  if (flag(data.hidden_owner) || flag(data.can_take_back_ownership)) {
    flags.push('Owner-Rechte rückholbar/versteckt');
    score -= 0.25;
  }
  if (flag(data.owner_change_balance)) {
    flags.push('Owner kann Guthaben ändern');
    score -= 0.4;
  }
  if (flag(data.selfdestruct)) {
    flags.push('Selfdestruct-Funktion');
    score -= 0.4;
  }
  if (flag(data.is_mintable)) {
    flags.push('Nachprägbar (mintable)');
    score -= 0.15;
  }
  if (data.is_open_source !== undefined && !flag(data.is_open_source)) {
    flags.push('Quellcode nicht verifiziert');
    score -= 0.25;
  }
  if (flag(data.trading_cooldown)) {
    flags.push('Handels-Cooldown aktiv');
    score -= 0.15;
  }

  const lpHolders = data.lp_holders ?? [];
  const lpLockedPct = lpHolders
    .filter((h) => h.is_locked === 1)
    .reduce((sum, h) => sum + safeNumber(h.percent) * 100, 0);
  const lpLocked = lpLockedPct > 50;
  if (!lpLocked && lpHolders.length > 0) {
    flags.push(`LP nur zu ${lpLockedPct.toFixed(0)}% gesperrt`);
    score -= 0.2;
  }

  const holders = data.holders ?? [];
  const top10HolderPct = holders
    .slice(0, 10)
    .filter((h) => h.is_locked !== 1)
    .reduce((sum, h) => sum + safeNumber(h.percent) * 100, 0);
  if (top10HolderPct > 60) {
    flags.push(`Top-10-Wallets halten ${top10HolderPct.toFixed(0)}%`);
    score -= 0.25;
  } else if (top10HolderPct > 40) {
    score -= 0.1;
  }

  const holderCount = safeNumber(data.holder_count);
  if (holderCount > 0 && holderCount < 150) {
    flags.push(`Nur ${holderCount} Halter`);
    score -= 0.15;
  }

  score = clamp(score, 0, 1);
  return {
    checked: true,
    ok: !isHoneypot && sellTaxPct <= 12 && score >= 0.35,
    score,
    isHoneypot,
    buyTaxPct,
    sellTaxPct,
    lpLocked,
    isMintable: flag(data.is_mintable),
    isOpenSource: flag(data.is_open_source),
    canTakeBackOwnership: flag(data.can_take_back_ownership),
    holderCount,
    top10HolderPct,
    flags,
    source: 'GoPlus Security',
  };
}

interface GoPlusSolana {
  balance_mutable_authority?: { authority?: unknown[]; status?: string };
  freezable?: { status?: string };
  mintable?: { status?: string };
  closable?: { status?: string };
  transfer_fee?: Record<string, unknown>;
  non_transferable?: string;
  holder_count?: string;
  holders?: { percent?: string }[];
}

function evaluateSolana(data: GoPlusSolana): SecurityReport {
  const flags: string[] = [];
  let score = 1;
  const on = (v: { status?: string } | undefined) => v?.status === '1';

  if (data.non_transferable === '1') {
    flags.push('Token nicht übertragbar');
    score = 0;
  }
  if (on(data.freezable)) {
    flags.push('Konten einfrierbar');
    score -= 0.5;
  }
  if (on(data.mintable)) {
    flags.push('Nachprägbar (mint authority aktiv)');
    score -= 0.25;
  }
  if (on(data.closable)) {
    flags.push('Mint-Konto schließbar');
    score -= 0.2;
  }
  if (on(data.balance_mutable_authority)) {
    flags.push('Guthaben durch Authority änderbar');
    score -= 0.4;
  }

  const top10HolderPct = (data.holders ?? [])
    .slice(0, 10)
    .reduce((sum, h) => sum + safeNumber(h.percent) * 100, 0);
  if (top10HolderPct > 60) {
    flags.push(`Top-10-Wallets halten ${top10HolderPct.toFixed(0)}%`);
    score -= 0.25;
  }

  score = clamp(score, 0, 1);
  return {
    checked: true,
    ok: score >= 0.35 && data.non_transferable !== '1' && !on(data.freezable),
    score,
    isHoneypot: data.non_transferable === '1',
    buyTaxPct: 0,
    sellTaxPct: 0,
    lpLocked: false,
    isMintable: on(data.mintable),
    isOpenSource: true,
    canTakeBackOwnership: on(data.balance_mutable_authority),
    holderCount: safeNumber(data.holder_count),
    top10HolderPct,
    flags,
    source: 'GoPlus Security (Solana)',
  };
}

const cache = new Map<string, { expires: number; report: SecurityReport }>();

/**
 * Rug-/Honeypot-Pruefung. Der wichtigste Filter des Bots: ein Token, aus dem
 * man nicht wieder herauskommt, ruiniert jede Trefferquote.
 */
export async function checkSecurity(chain: string, tokenAddress: string): Promise<SecurityReport> {
  const key = `${chain}:${tokenAddress.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.report;

  let report: SecurityReport;
  try {
    if (chain === 'solana') {
      const res = await getJson<{ code: number; result?: Record<string, GoPlusSolana> }>(
        `${GOPLUS}/solana/token_security?contract_addresses=${tokenAddress}`,
        { timeoutMs: 7_000, retries: 0 },
      );
      const data = res?.result?.[tokenAddress] ?? Object.values(res?.result ?? {})[0];
      report = data ? evaluateSolana(data) : unchecked('Keine Sicherheitsdaten verfügbar');
    } else {
      const chainConfig = Object.values(CHAINS).find((c) => c.dexscreenerId === chain);
      if (!chainConfig) {
        report = unchecked(`Chain ${chain} wird von der Sicherheitsprüfung nicht unterstützt`);
      } else {
        const res = await getJson<{ code: number; result?: Record<string, GoPlusEvm> }>(
          `${GOPLUS}/token_security/${chainConfig.goplusId}?contract_addresses=${tokenAddress.toLowerCase()}`,
          { timeoutMs: 7_000, retries: 0 },
        );
        const data = res?.result?.[tokenAddress.toLowerCase()] ?? Object.values(res?.result ?? {})[0];
        report = data ? evaluateEvm(data) : unchecked('Keine Sicherheitsdaten verfügbar');
      }
    }
  } catch {
    report = unchecked('Sicherheitsprüfung fehlgeschlagen');
  }

  // Saubere Ergebnisse laenger cachen, problematische kurz (koennen sich aendern).
  cache.set(key, { expires: Date.now() + (report.checked ? 10 * 60_000 : 90_000), report });
  return report;
}
