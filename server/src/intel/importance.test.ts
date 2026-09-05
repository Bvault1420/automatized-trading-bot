import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { annotateNewsItem, isJunkNews, scoreImportance } from './importance.js';

describe('scoreImportance', () => {
  it('hebt Politik, Firmen und große Trader an', () => {
    const sec = scoreImportance('SEC sues Binance over compliance failures', 'CoinDesk');
    assert.equal(sec.tier, 'high');
    assert.ok(sec.score >= 0.68);
    assert.ok(sec.actors.includes('Aufsicht/Politik') || sec.actors.includes('Krypto-Firma'));

    const fed = scoreImportance('Powell signals Fed rate cut as Bitcoin ETF inflows jump', 'The Block');
    assert.equal(fed.tier, 'high');

    const whale = scoreImportance('BlackRock and a whale accumulate Bitcoin after Trump comments', 'Decrypt');
    assert.ok(whale.tier === 'high' || whale.tier === 'medium');
    assert.ok(whale.actors.length >= 1);
  });

  it('filtert Clickbait, Giveaways und anonyme Moon-Calls', () => {
    const moon = scoreImportance('This gem will 100x to the moon join telegram', 'Reddit r/memecoins');
    assert.equal(moon.tier, 'junk');

    const airdrop = scoreImportance('FREE MINT airdrop claim now next pepe', 'DexScreener Profil (solana)');
    assert.equal(airdrop.tier, 'junk');
    assert.equal(
      isJunkNews(
        annotateNewsItem({
          title: 'FREE MINT airdrop claim now next pepe',
          url: '',
          source: 'DexScreener Profil (solana)',
          publishedAt: 0,
          sentiment: 0,
          matchedTerms: [],
        }),
      ),
      true,
    );

    const direct = scoreImportance('next bonk moonshot guaranteed easy profit', 'Google News Memes 1h');
    assert.equal(direct.tier, 'junk');
  });

  it('lässt seriöse Quellen ohne Hype als mittel oder hoch stehen', () => {
    const market = scoreImportance('Bitcoin holds above $60,000 as traders watch liquidity', 'CoinDesk');
    assert.notEqual(market.tier, 'junk');
    assert.ok(market.score >= 0.45);
  });
});
