/**
 * Connection handshake + heartbeat protocol.
 * Spec §11.2
 */

import { MessageType } from './message';

export interface HandshakeInit {
  type: typeof MessageType.HANDSHAKE_INIT;
  version: number;
  clientPub: Uint8Array;
  supportedCiphers: string[];
}

export interface HandshakeResponse {
  type: typeof MessageType.HANDSHAKE_RESPONSE;
  version: number;
  serverPub: Uint8Array;
  sessionId: string;
  selectedCipher: string;
  expiresAt: number;
}

export interface Heartbeat {
  type: typeof MessageType.HEARTBEAT;
  timestamp: number;
  serverTime?: number;
}

export interface SessionResumeRequest {
  sessionId: string;
  lastTxid?: bigint;
}

export interface SessionResumeResponse {
  resumed: boolean;
  expired?: boolean;
  currentTxid?: bigint;
}

export interface ConnectionState {
  sessionId: string;
  sessionKey: Uint8Array;
  cipher: string;
  expiresAt: number;
  missedHeartbeats: number;
  lastHeartbeat: number;
}

const BASE_DELAY = 100;
const MAX_DELAY = 10_000;

export function retryDelay(attempt: number): number {
  return Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY);
}

export function shouldRetry(statusOrCode: number | string, attempt: number, maxRetries = 3): boolean {
  if (attempt >= maxRetries) return false;

  if (typeof statusOrCode === 'number') {
    // 4xx = client error, no retry (except timeout 408)
    if (statusOrCode >= 400 && statusOrCode < 500 && statusOrCode !== 408) return false;
    // 5xx = server error, retry
    if (statusOrCode >= 500) return true;
  }

  if (typeof statusOrCode === 'string') {
    // Session expired: re-handshake needed, retry original
    if (statusOrCode === 'SESSION_EXPIRED') return true;
    // Timeout: retry once
    if (statusOrCode === 'TIMEOUT') return attempt < 1;
  }

  // Network errors: retry
  return true;
}

export function createHandshakeInit(clientPub: Uint8Array): HandshakeInit {
  return {
    type: MessageType.HANDSHAKE_INIT,
    version: 1,
    clientPub,
    supportedCiphers: ['chacha20-poly1305', 'aes-256-gcm'],
  };
}

export function createHandshakeResponse(
  serverPub: Uint8Array,
  sessionId: string,
  cipher: string,
  ttlMs: number
): HandshakeResponse {
  return {
    type: MessageType.HANDSHAKE_RESPONSE,
    version: 1,
    serverPub,
    sessionId,
    selectedCipher: cipher,
    expiresAt: Date.now() + ttlMs,
  };
}

export function createHeartbeat(): Heartbeat {
  return {
    type: MessageType.HEARTBEAT,
    timestamp: Date.now(),
  };
}

export function respondHeartbeat(incoming: Heartbeat): Heartbeat {
  return {
    type: MessageType.HEARTBEAT,
    timestamp: incoming.timestamp,
    serverTime: Date.now(),
  };
}

export function checkHeartbeatHealth(state: ConnectionState, now = Date.now()): 'ok' | 'warn' | 'reconnect' | 'terminate' {
  const elapsed = now - state.lastHeartbeat;
  const interval = 60_000; // 60s

  if (elapsed < interval * 1.5) return 'ok';
  if (state.missedHeartbeats === 0) return 'warn';
  if (state.missedHeartbeats === 1) return 'reconnect';
  return 'terminate';
}

export function processHeartbeat(state: ConnectionState): ConnectionState {
  return {
    ...state,
    missedHeartbeats: 0,
    lastHeartbeat: Date.now(),
  };
}

export function tickMissedHeartbeat(state: ConnectionState): ConnectionState {
  return {
    ...state,
    missedHeartbeats: state.missedHeartbeats + 1,
  };
}
