import { config } from '../../config.js';
import { portfolio } from '../portfolio.js';
import { fetchPairSnapshot } from '../../scanner/dexscreener.js';
import { clamp } from '../../util/num.js';
import type { Position, TokenCandidate } from '../../types.js';
import type { BuyResult, Executor, SellResult } from './types.js';

/**
 * Simuliert Orders gegen echte Live-Kurse.
 *
 * Wichtig fuer die Aussagekraft: Gebuehren und Slippage werden mitgerechnet.
 * Ohne diese Kosten sehen Memecoin-Strategien im Papierhandel deutlich besser
 * aus als sie sind – gerade bei sehr kurzen Haltedauern.
 */
export class PaperExecutor implements Executor {
  readonly mode = 'paper' as const;

  async availableCashUsd(): Promise<number> {
    return portfolio.cash('paper');
  }

  async blockers(): Promise<string[]> {
    return [];
  }

  /**
   * Konstantes-Produkt-Modell: Preisauswirkung waechst mit dem Verhaeltnis von
   * Ordergroesse zur Poolliquiditaet. Bei 10 USD in einem 50k-Pool ist das
   * winzig, bei einem 2k-Pool spuerbar.
   */
  private priceImpactPct(amountUsd: number, liquidityUsd: number): number {
    if (liquidityUsd <= 0) return 100;
    // Pool-Seite entspricht etwa der halben Gesamtliquiditaet.
    const ratio = amountUsd / (liquidityUsd / 2);
    return clamp((ratio / (1 + ratio)) * 100, 0, 100);
  }

  async buy(candidate: TokenCandidate, amountUsd: number, maxSlippagePct: number): Promise<BuyResult> {
    const snapshot = await fetchPairSnapshot(candidate.chain, candidate.pairAddress);
    const price = snapshot?.priceUsd ?? candidate.priceUsd;
    const liquidity = snapshot?.liquidityUsd ?? candidate.liquidityUsd;

    if (price <= 0) {
      return { ok: false, error: 'Kein gültiger Preis verfügbar', tokenAmount: 0, priceUsd: 0, spentUsd: 0, feeUsd: 0, slippagePct: 0 };
    }

    const impact = this.priceImpactPct(amountUsd, liquidity);
    if (impact > maxSlippagePct) {
      return {
        ok: false,
        error: `Erwartete Slippage ${impact.toFixed(2)}% über dem Limit von ${maxSlippagePct}%`,
        tokenAmount: 0, priceUsd: price, spentUsd: 0, feeUsd: 0, slippagePct: impact,
      };
    }

    const feePct = config.defaults.paperFeePct;
    const gasUsd = amountUsd <= 8 ? 0.08 : 0.02;
    const feeUsd = amountUsd * (feePct / 100) + gasUsd;
    const effectivePrice = price * (1 + impact / 100);
    const tokenAmount = (amountUsd - feeUsd) / effectivePrice;

    return {
      ok: true,
      tokenAmount,
      priceUsd: effectivePrice,
      spentUsd: amountUsd,
      feeUsd,
      slippagePct: impact,
    };
  }

  async sell(position: Position, fraction: number, maxSlippagePct: number): Promise<SellResult> {
    const snapshot = await fetchPairSnapshot(position.chain, position.pairAddress);
    const price = snapshot?.priceUsd ?? position.lastPrice;
    if (price <= 0) {
      return { ok: false, error: 'Kein gültiger Preis verfügbar', tokenAmount: 0, priceUsd: 0, proceedsUsd: 0, feeUsd: 0, slippagePct: 0 };
    }

    const tokenAmount = position.tokenAmount * clamp(fraction, 0, 1);
    const grossUsd = tokenAmount * price;
    const liquidity = snapshot?.liquidityUsd ?? 0;
    const impact = this.priceImpactPct(grossUsd, liquidity);

    // Beim Verkauf wird Slippage akzeptiert – Aussteigen hat Vorrang vor Preis.
    const effectivePrice = price * (1 - Math.min(impact, 60) / 100);
    const feePct = config.defaults.paperFeePct;
    const proceedsBeforeFees = tokenAmount * effectivePrice;
    const gasUsd = proceedsBeforeFees <= 8 ? 0.08 : 0.02;
    const feeUsd = proceedsBeforeFees * (feePct / 100) + gasUsd;

    return {
      ok: true,
      tokenAmount,
      priceUsd: effectivePrice,
      proceedsUsd: Math.max(0, proceedsBeforeFees - feeUsd),
      feeUsd,
      slippagePct: impact,
      txHash: undefined,
    };
  }
}
