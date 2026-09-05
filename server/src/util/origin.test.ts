import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { originAllowed } from './origin.js';

describe('originAllowed', () => {
  it('erlaubt fehlenden Origin (same-origin / curl)', () => {
    assert.equal(originAllowed(undefined, 8787), true);
  });

  it('erlaubt localhost und 127.0.0.1', () => {
    assert.equal(originAllowed('http://localhost:5173', 8787), true);
    assert.equal(originAllowed('http://127.0.0.1:8787', 8787), true);
  });

  it('erlaubt Dashboard auf dem API-Port (LAN / VPS / Handy)', () => {
    assert.equal(originAllowed('http://192.168.1.20:8787', 8787), true);
    assert.equal(originAllowed('https://bot.example.com:8787', 8787), true);
  });

  it('erlaubt Vite-Dev vom Handy im LAN (Port 5173)', () => {
    assert.equal(originAllowed('http://192.168.1.20:5173', 8787), true);
    assert.equal(originAllowed('http://10.0.0.42:5173', 8787), true);
  });

  it('lehnt fremde Origins auf anderem Port ab', () => {
    assert.equal(originAllowed('https://evil.example:443', 8787), false);
    assert.equal(originAllowed('http://192.168.1.20:3000', 8787), false);
  });
});
