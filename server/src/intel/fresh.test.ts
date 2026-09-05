import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mentionBoost } from './fresh.js';

describe('mentionBoost', () => {
  it('gibt 0 ohne Treffer und einen Bonus bei frischer Erwähnung', () => {
    assert.equal(mentionBoost('PEPE', []), 0);
    const boost = mentionBoost('PEPE', [{ term: 'PEPE', mentions: 3, newestAgeMin: 4 }]);
    assert.ok(boost > 0.1);
    assert.ok(boost < 0.25);
  });
});
