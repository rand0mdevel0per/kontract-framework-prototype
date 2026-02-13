import { describe, it, expect } from 'vitest';
import {
  createHandshakeInit,
  createHandshakeResponse,
  createHeartbeat,
  respondHeartbeat,
  checkHeartbeatHealth,
  processHeartbeat,
  tickMissedHeartbeat,
  retryDelay,
  shouldRetry,
} from '../src/protocol/handshake';
import type { ConnectionState } from '../src/protocol/handshake';
import { MessageType } from '../src/protocol/message';

function makeState(overrides?: Partial<ConnectionState>): ConnectionState {
  return {
    sessionId: 'test-session',
    sessionKey: new Uint8Array(32),
    cipher: 'chacha20-poly1305',
    expiresAt: Date.now() + 300_000,
    missedHeartbeats: 0,
    lastHeartbeat: Date.now(),
    ...overrides,
  };
}

describe('handshake', () => {
  it('creates handshake init with correct fields', () => {
    const pub = new Uint8Array(32);
    const init = createHandshakeInit(pub);
    expect(init.type).toBe(MessageType.HANDSHAKE_INIT);
    expect(init.version).toBe(1);
    expect(init.clientPub).toBe(pub);
    expect(init.supportedCiphers).toContain('chacha20-poly1305');
  });

  it('creates handshake response', () => {
    const pub = new Uint8Array(32);
    const resp = createHandshakeResponse(pub, 'sid-1', 'chacha20-poly1305', 300_000);
    expect(resp.type).toBe(MessageType.HANDSHAKE_RESPONSE);
    expect(resp.sessionId).toBe('sid-1');
    expect(resp.selectedCipher).toBe('chacha20-poly1305');
    expect(resp.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe('heartbeat', () => {
  it('creates heartbeat with timestamp', () => {
    const hb = createHeartbeat();
    expect(hb.type).toBe(MessageType.HEARTBEAT);
    expect(hb.timestamp).toBeGreaterThan(0);
  });

  it('responds with server time', () => {
    const hb = createHeartbeat();
    const resp = respondHeartbeat(hb);
    expect(resp.timestamp).toBe(hb.timestamp);
    expect(resp.serverTime).toBeGreaterThan(0);
  });

  it('health ok when recent heartbeat', () => {
    const state = makeState({ lastHeartbeat: Date.now() });
    expect(checkHeartbeatHealth(state)).toBe('ok');
  });

  it('health warn on first miss', () => {
    const state = makeState({
      lastHeartbeat: Date.now() - 100_000,
      missedHeartbeats: 0,
    });
    expect(checkHeartbeatHealth(state)).toBe('warn');
  });

  it('health reconnect on second miss', () => {
    const state = makeState({
      lastHeartbeat: Date.now() - 100_000,
      missedHeartbeats: 1,
    });
    expect(checkHeartbeatHealth(state)).toBe('reconnect');
  });

  it('health terminate on third miss', () => {
    const state = makeState({
      lastHeartbeat: Date.now() - 100_000,
      missedHeartbeats: 2,
    });
    expect(checkHeartbeatHealth(state)).toBe('terminate');
  });

  it('processHeartbeat resets missed count', () => {
    const state = makeState({ missedHeartbeats: 2 });
    const updated = processHeartbeat(state);
    expect(updated.missedHeartbeats).toBe(0);
  });

  it('tickMissedHeartbeat increments count', () => {
    const state = makeState({ missedHeartbeats: 1 });
    const updated = tickMissedHeartbeat(state);
    expect(updated.missedHeartbeats).toBe(2);
  });
});

describe('retry', () => {
  it('exponential backoff', () => {
    expect(retryDelay(0)).toBe(100);
    expect(retryDelay(1)).toBe(200);
    expect(retryDelay(2)).toBe(400);
    expect(retryDelay(10)).toBe(10_000); // capped at MAX_DELAY
  });

  it('no retry on 4xx except 408', () => {
    expect(shouldRetry(400, 0)).toBe(false);
    expect(shouldRetry(403, 0)).toBe(false);
    expect(shouldRetry(404, 0)).toBe(false);
    expect(shouldRetry(408, 0)).toBe(true); // timeout
  });

  it('retry on 5xx', () => {
    expect(shouldRetry(500, 0)).toBe(true);
    expect(shouldRetry(503, 0)).toBe(true);
  });

  it('no retry past max attempts', () => {
    expect(shouldRetry(500, 3)).toBe(false);
  });

  it('retry on SESSION_EXPIRED', () => {
    expect(shouldRetry('SESSION_EXPIRED', 0)).toBe(true);
  });

  it('TIMEOUT retries once only', () => {
    expect(shouldRetry('TIMEOUT', 0)).toBe(true);
    expect(shouldRetry('TIMEOUT', 1)).toBe(false);
  });
});
