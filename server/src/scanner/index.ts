import { bus } from '../util/bus.js';
import { createLogger } from '../util/logger.js';
import { pooled } from '../util/http.js';
import { discoverCandidates } from './dexscreener.js';
import { checkSecurity } from './security.js';
import { scoreCandidate, type ScoringContext } from './scoring.js';
import type { ScoredCandidate, SecurityReport } from '../types.js';

const log = createLogger('scanner');

let latest: ScoredCandidate[] = [];

export interface ScanOptions extends Omit<ScoringContext, 'blacklist' | 'cooldowns'> {
  chains: string[];
  blacklist: Set<string>;
  cooldowns: Map<string, number>;
}

/**
 * Ein kompletter Scan-Durchlauf: Kandidaten finden, vorsortieren, die besten
 * sicherheitspruefen und final bewerten.
 *
 * Die Sicherheitspruefung ist der teuerste Schritt (ein API-Call pro Token),
 * deshalb laeuft sie nur auf der Vorauswahl.
 */
export async function runScan(options: ScanOptions): Promise<ScoredCandidate[]> {
  const started = Date.now();
  const candidates = await discoverCandidates(options.chains, options.minLiquidityUsd);

  if (candidates.length === 0) {
    log.warn('Keine Kandidaten gefunden – Datenquelle möglicherweise nicht erreichbar');
    return latest;
  }

  const ctx: ScoringContext = {
    intel: options.intel,
    minLiquidityUsd: options.minLiquidityUsd,
    liveChain: options.liveChain,
    blacklist: options.blacklist,
    cooldowns: options.cooldowns,
  };

  // Vorauswahl ohne Sicherheitsdaten (neutral angenommen), damit nur die
  // aussichtsreichsten Token teure Security-Calls ausloesen.
  const neutralSecurity = (): SecurityReport => ({
    checked: false,
    ok: true,
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
    flags: [],
    source: 'vorläufig',
  });

  const preRanked = candidates
    .map((candidate) => ({ candidate, pre: scoreCandidate(candidate, neutralSecurity(), ctx) }))
    .sort((a, b) => b.pre.rawScore - a.pre.rawScore)
    .slice(0, 28);

  const scored = await pooled(preRanked, 5, async ({ candidate }) => {
    const security = await checkSecurity(candidate.chain, candidate.tokenAddress);
    return scoreCandidate(candidate, security, ctx);
  });

  latest = scored.sort((a, b) => b.score - a.score).slice(0, 25);
  bus.emitEvent('candidates', latest);

  const tradable = latest.filter((c) => c.tradable).length;
  log.info(
    `Scan abgeschlossen: ${candidates.length} Paare → ${latest.length} bewertet, ${tradable} handelbar (${Date.now() - started} ms)`,
  );
  return latest;
}

export function getCandidates(): ScoredCandidate[] {
  return latest;
}
