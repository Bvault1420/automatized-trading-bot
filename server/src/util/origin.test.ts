import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigin } from './origin.js';

describe('allowedOrigin', () => {
  it('erlaubt localhost für Firefox/Chrome am PC', () => {
    assert.equal(allowedOrigin('http://localhost:5173'), true);
    assert.equal(allowedOrigin('http://localhost:8787'), true);
    assert.equal(allowedOrigin('http://127.0.0.1:8787'), true);
    assert.equal(allowedOrigin('http://[::1]:8787'), true);
  });

  it('erlaubt LAN-IPs fürs Handy im gleichen WLAN', () => {
    assert.equal(allowedOrigin('http://192.168.1.20:8787'), true);
    assert.equal(allowedOrigin('http://10.0.0.8:5173'), true);
    assert.equal(allowedOrigin('http://172.16.4.2:8787'), true);
    assert.equal(allowedOrigin('http://aegis.local:8787'), true);
  });

  it('erlaubt Cloud-Tunnel-Hosts', () => {
    assert.equal(allowedOrigin('https://foo.cursorvm.com'), true);
    assert.equal(allowedOrigin('https://bar.cvm.dev'), true);
  });

  it('lehnt fremde Websites ab', () => {
    assert.equal(allowedOrigin('https://evil.example'), false);
  });
});
