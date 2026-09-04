import { db } from '../store/db.js';
import type { Trade } from '../types.js';

export interface TradeMemory {
  cooldownMs: number;
  blacklisted: boolean;
}

function tokenKey(trade: Trade): string {
  return `${trade.chain}:${trade.tokenAddress.toLowerCase()}`;
}

/**
 * Lernt aus jedem abgeschlossenen Trade: Verlierer werden länger gesperrt,
 * harte Rugs kommen auf die Blacklist, Gewinner nicht sofort nachgekauft.
 */
export function rememberTrade(trade: Trade): TradeMemory {
  const key = tokenKey(trade);
  let cooldownMs = 25 * 60_000;
  let blacklisted = false;

  if (trade.pnlPct <= -40) {
    blacklisted = true;
    cooldownMs = 24 * 60 * 60_000;
  } else if (trade.pnlPct <= 0) {
    cooldownMs = 2 * 60 * 60_000;
  } else if (trade.pnlPct < 10) {
    cooldownMs = 40 * 60_000;
  }

  db.update((draft) => {
    draft.cooldowns[key] = Date.now() + cooldownMs;
    if (blacklisted && !draft.blacklist.includes(key)) {
      draft.blacklist.push(key);
    }
  });

  return { cooldownMs, blacklisted };
}

/** Globale Pause nach Verlustserien – oft ist das Regime gekippt. */
export function lossCooldownMs(consecutiveLosses: number): number {
  if (consecutiveLosses >= 4) return 45 * 60_000;
  if (consecutiveLosses >= 3) return 25 * 60_000;
  if (consecutiveLosses >= 2) return 12 * 60_000;
  return 0;
}
