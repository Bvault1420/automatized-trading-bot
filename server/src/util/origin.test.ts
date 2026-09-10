import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigin } from './origin.js';

describe('allowedOrigin', () => {
  it('erlaubt localhost und Cloud-Hosts', () => {
    assert.equal(allowedOrigin('http://localhost:5173'), true);
    assert.equal(allowedOrigin('https://foo.cursorvm.com'), true);
    assert.equal(allowedOrigin('https://evil.example'), false);
  });
});
