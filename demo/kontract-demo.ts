/**
 * Kontract Full Feature Demo
 *
 * This demo exercises every module in the framework.
 * Run with: npx tsx demo/kontract-demo.ts
 *
 * Modules covered:
 *  1. TableProxy + MVCC
 *  2. SessionDO (transaction coordination)
 *  3. SharedStorage (two-tier cache)
 *  4. Permissions (rwx bitmask)
 *  5. @backend compiler
 *  6. Cookbook doc generator
 *  7. Lazy route loading
 *  8. FlatBuffers schema generation
 *  9. SWC optimization
 * 10. SSE EventBus
 * 11. PostgreSQL webhooks
 * 12. Raystream encryption
 * 13. Message protocol
 * 14. Handshake + heartbeat
 * 15. DO Pool (work-stealing)
 * 16. Middleware chain
 * 17. Auth (JWT, providers, session, middleware)
 * 18. Auth router
 * 19. TiKV adapter
 * 20. Node.js gateway
 * 21. Build cache
 * 22. Storage registry
 * 23. Migration CLI
 * 24. HTTP utilities
 */

// ─── 1. TableProxy + MVCC ────────────────────────────────

import { TableProxy, type PGClient, type Context } from '../src/storage/TableProxy';

// Mock PG client for demo
const rows: Record<string, unknown>[] = [];
const mockPg: PGClient = {
  async query(sql: string, params?: unknown[]) {
    if (sql.includes('SELECT ptr FROM storage')) {
      return { rows: [{ ptr: 'tbl_tasks_demo' }] };
    }
    if (sql.includes('SELECT data FROM')) {
      const id = params?.[0];
      const row = rows.find(r => r.id === id);
      return { rows: row ? [row] : [] };
    }
    if (sql.includes('INSERT INTO') || sql.includes('UPDATE')) {
      const id = params?.[0] as string;
      const data = params?.[1] ? JSON.parse(params[1] as string) : {};
      const existing = rows.findIndex(r => r.id === id);
      if (existing >= 0) rows[existing] = { id, data };
      else rows.push({ id, data });
      return { rows: [] };
    }
    if (sql.includes('DELETE')) {
      return { rows: [] };
    }
    return { rows: [] };
  }
};

const ctx: Context = {
  sid: 'demo-session',
  owner: 'demo-user',
  currentTxid: 1000n,
  perm: 0b111,
};

const tasks = new TableProxy<{ title: string; done: boolean }>(mockPg, 'tasks', ctx);

async function demoTableProxy() {
  console.log('\n=== 1. TableProxy + MVCC ===');

  await tasks.set('t1', { title: 'Build Kontract', done: false });
  console.log('SET t1:', { title: 'Build Kontract', done: false });

  await tasks.update('t1', { done: true });
  console.log('UPDATE t1: done = true');

  const val = await tasks.get('t1');
  console.log('GET t1:', val);

  await tasks.delete('t1');
  console.log('DELETE t1: ok');
}

// ─── 2. SessionDO ────────────────────────────────────────

import { SessionDO } from '../src/runtime/SessionDO';

async function demoSessionDO() {
  console.log('\n=== 2. SessionDO (Transaction Coordination) ===');

  const session = new SessionDO();
  const tx1 = await session.beginTransaction('alice');
  console.log('TX1:', { sid: tx1.sid.slice(0, 8) + '...', txid: tx1.currentTxid.toString() });

  const tx2 = await session.beginTransaction('bob');
  console.log('TX2:', { sid: tx2.sid.slice(0, 8) + '...', txid: tx2.currentTxid.toString() });

  console.log('Min active txid:', session.minActiveTxid.toString());

  await session.commit(tx1.sid);
  console.log('Committed TX1, min active txid:', session.minActiveTxid.toString());

  await session.commit(tx2.sid);
}

// ─── 3. SharedStorage ────────────────────────────────────

import { SharedStorage, MemoryDOStub } from '../src/runtime/shared';

async function demoSharedStorage() {
  console.log('\n=== 3. SharedStorage (Two-Tier Cache) ===');

  const doStub = new MemoryDOStub();
  const kv = {
    store: new Map<string, string>(),
    async get<T>(key: string): Promise<T | null> {
      const v = this.store.get(key);
      return v ? JSON.parse(v) as T : null;
    },
    async put(key: string, value: string) { this.store.set(key, value); },
    async delete(key: string) { this.store.delete(key); },
  };

  const shared = new SharedStorage(doStub, kv);

  await shared.set('config', { theme: 'dark', lang: 'ja' });
  console.log('SET config:', { theme: 'dark', lang: 'ja' });

  const cached = await shared.get('config');
  console.log('GET config (from DO tier):', cached);

  await shared.delete('config');
  console.log('DELETE config: ok');

  const miss = await shared.get('config');
  console.log('GET config (after delete):', miss);
}

// ─── 4. Permissions ──────────────────────────────────────

import { perms, verifyAccess, checkTablePermission, checkFieldPermissions } from '../src/security/permissions';

function demoPermissions() {
  console.log('\n=== 4. Permissions (RWX Bitmask) ===');

  console.log('Permission constants:', {
    R__: perms.R__.toString(2).padStart(3, '0'),
    _W_: perms._W_.toString(2).padStart(3, '0'),
    RWX: perms.RWX.toString(2).padStart(3, '0'),
  });

  const permCtx = { sid: 's1', owner: 'alice', perm: perms.RW_ };
  try {
    verifyAccess(permCtx, perms.R__, 'alice');
    console.log('verifyAccess(R, owner=alice): PASS');
  } catch (e) {
    console.log('verifyAccess failed:', (e as Error).message);
  }

  try {
    checkTablePermission(perms.R__, 'write');
  } catch (e) {
    console.log('checkTablePermission(R, write): BLOCKED -', (e as Error).message);
  }

  try {
    checkFieldPermissions({ name: 'test' }, { name: perms._W_ }, perms.R__);
  } catch (e) {
    console.log('checkFieldPermissions(name, R-only): BLOCKED -', (e as Error).message);
  }
}

// ─── 5. @backend Compiler ────────────────────────────────

import { transformBackend } from '../src/compiler/backend';

function demoBackendCompiler() {
  console.log('\n=== 5. @backend Compiler ===');

  const source = `
@backend({ perm: 7, egroup: "api" })
export async function greet(name: string): Promise<string> {
  return "Hello, " + name;
}

@backend({ perm: 4, ugroup: "admin" })
export async function getStats(): Promise<object> {
  return { users: 42 };
}
`;

  const result = transformBackend(source);
  console.log('Routes found:', result.routes.length);
  for (const r of result.routes) {
    console.log(`  - ${r.name}:`, r.meta);
  }
  console.log('Client stub (first 80 chars):', result.client.slice(0, 80) + '...');
  console.log('Server registration (first 80 chars):', result.server.slice(0, 80) + '...');
}

// ─── 6. Cookbook Doc Generator ────────────────────────────

import { extractDocComment, extractParamTypes, extractReturnType, generateCookbook, cookbookToVitepress } from '../src/compiler/cookbook';

function demoCookbook() {
  console.log('\n=== 6. Cookbook Doc Generator ===');

  const source = `
/// # Create User
/// Creates a new user account in the system.
/// Requires admin privileges.
@backend({ perm: 7, ugroup: "admin" })
export async function createUser(name: string, email?: string): Promise<User> {
  return {} as User;
}

/** Get user by ID. */
@backend({ perm: 4 })
export async function getUser(id: string): Promise<User> {
  return {} as User;
}
`;

  const doc = extractDocComment(source, 'createUser');
  console.log('Doc comment (///):', JSON.stringify(doc.slice(0, 60)) + '...');

  const params = extractParamTypes(source, 'createUser');
  console.log('Params:', params);

  const ret = extractReturnType(source, 'createUser');
  console.log('Return type:', ret);

  const routes = [
    { name: 'createUser', meta: { perm: 7, ugroup: 'admin' } },
    { name: 'getUser', meta: { perm: 4 } },
  ];
  const cookbook = generateCookbook([{ path: 'api/users.ts', content: source, routes }]);
  console.log('Cookbook entries:', cookbook.entries.length);

  const pages = cookbookToVitepress(cookbook);
  console.log('VitePress pages generated:', [...pages.keys()]);
}

// ─── 7. Lazy Route Loading ───────────────────────────────

import { generateLazyRoutes, type LazyRouteEntry } from '../src/compiler/lazy';

function demoLazyRoutes() {
  console.log('\n=== 7. Lazy Route Loading ===');

  const entries: LazyRouteEntry[] = [
    { name: 'createUser', modulePath: './api/users.js', meta: { perm: 7 } },
    { name: 'getUser', modulePath: './api/users.js', meta: { perm: 4 } },
    { name: 'deleteUser', modulePath: './api/admin.js', meta: { perm: 7 } },
  ];

  const code = generateLazyRoutes(entries);
  console.log('Generated lazy loader:');
  for (const line of code.split('\n').slice(0, 6)) {
    console.log('  ' + line);
  }
  console.log('  ...');
}

// ─── 8. FlatBuffers Schema Generation ────────────────────

import { generateFBSSchema, fieldsFromRecord, generateRPCSchema } from '../src/compiler/flatbuffers';

function demoFlatBuffers() {
  console.log('\n=== 8. FlatBuffers Schema Generation ===');

  const schema = generateFBSSchema({
    namespace: 'Kontract.Demo',
    tables: [{
      name: 'User',
      fields: fieldsFromRecord(
        { id: 'string', name: 'string', age: 'number', active: 'boolean' },
        { age: 'int32' }
      ),
    }],
    rootType: 'User',
  });
  console.log(schema);

  const rpc = generateRPCSchema([
    { name: 'createUser', params: [{ name: 'name', type: 'string' }, { name: 'age', type: 'number', annotation: 'int32' }], returnType: 'string' },
  ], 'Kontract.RPC');
  console.log('RPC schema tables:', rpc.tables.map(t => t.name));
}

// ─── 9. SWC Optimization ─────────────────────────────────

import { optimize } from '../src/compiler/swc';

async function demoSWC() {
  console.log('\n=== 9. SWC Optimization ===');

  const input = `
    var unused = 42;
    var x = 1 + 2 + 3;
    function greet(name) { return "Hello, " + name; }
    console.log(greet("world"));
  `;

  const optimized = await optimize(input, { dce: true, constantFolding: true, passes: 3 });
  console.log('Input length:', input.length, 'chars');
  console.log('Output length:', optimized.length, 'chars');
  console.log('Optimized:', optimized.slice(0, 80));
}

// ─── 10. SSE EventBus ────────────────────────────────────

import { EventBus, formatSSE, type ChangeEvent } from '../src/events/sse';

function demoSSE() {
  console.log('\n=== 10. SSE EventBus ===');

  const bus = new EventBus();
  const events: ChangeEvent[] = [];

  const unsub = bus.subscribe('users', (e) => events.push(e));
  console.log('Subscribed to "users" table, listeners:', bus.listenerCount('users'));

  bus.emit('users', { type: 'insert', id: 'u1', data: { name: 'Alice' } });
  bus.emit('users', { type: 'update', id: 'u1', data: { name: 'Alice B.' } });
  console.log('Emitted 2 events, received:', events.length);

  const sse = formatSSE(events[0]);
  console.log('SSE format:', sse.trim());

  unsub();
  console.log('Unsubscribed, listeners:', bus.listenerCount('users'));
}

// ─── 11. PostgreSQL Webhooks ─────────────────────────────

import {
  generateNotifyFunction, generateTriggerDDL, generateCleanupFunction,
  parseWebhookEvent, SubscriptionRegistry
} from '../src/events/webhook';

function demoWebhooks() {
  console.log('\n=== 11. PostgreSQL Webhooks ===');

  const notifyFn = generateNotifyFunction('https://api.example.com');
  console.log('Notify function (first 60 chars):', notifyFn.slice(0, 60) + '...');

  const trigger = generateTriggerDDL('tbl_users_abc');
  console.log('Trigger DDL:', trigger.split('\n')[0]);

  const cleanup = generateCleanupFunction();
  console.log('Cleanup function generated:', cleanup.length, 'chars');

  const event = parseWebhookEvent({
    table: 'tbl_users_abc',
    operation: 'INSERT',
    new: { id: 'u1', data: { name: 'Alice' } },
    old: null,
  });
  console.log('Parsed event:', event);

  const registry = new SubscriptionRegistry();
  const received: string[] = [];
  registry.subscribe('sub1', ['tbl_users_abc'], (e) => received.push(e.id!));
  registry.dispatch(event);
  console.log('Registry dispatched to', received.length, 'subscriber(s)');
}

// ─── 12. Raystream Encryption ────────────────────────────

import { encrypt, decrypt, hkdf } from '../src/protocol/raystream';

function demoRaystream() {
  console.log('\n=== 12. Raystream Encryption ===');

  const masterKey = new Uint8Array(32);
  crypto.getRandomValues(masterKey);

  const sessionKey = hkdf(masterKey, 'session-key', 32);
  console.log('Derived session key:', sessionKey.length, 'bytes');

  const payload = new TextEncoder().encode('{"method":"greet","args":["world"]}');
  const encrypted = encrypt(payload, sessionKey);
  console.log('Encrypted:', {
    nonce: encrypted.nonce.length + ' bytes',
    data: encrypted.data.length + ' bytes',
    tag: encrypted.tag.length + ' bytes',
  });

  const decrypted = decrypt(encrypted, sessionKey);
  const decoded = new TextDecoder().decode(decrypted);
  console.log('Decrypted:', decoded);
}

// ─── 13. Message Protocol ────────────────────────────────

import { MessageType, ErrorCode } from '../src/protocol/message';

function demoMessageProtocol() {
  console.log('\n=== 13. Message Protocol ===');

  console.log('Message types:', {
    HANDSHAKE_INIT: '0x' + MessageType.HANDSHAKE_INIT.toString(16),
    RPC_CALL: '0x' + MessageType.RPC_CALL.toString(16),
    SUBSCRIBE: '0x' + MessageType.SUBSCRIBE.toString(16),
    HEARTBEAT: '0x' + MessageType.HEARTBEAT.toString(16),
    CLOSE: '0x' + MessageType.CLOSE.toString(16),
  });

  console.log('Error codes:', [
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.SESSION_EXPIRED,
    ErrorCode.DECRYPTION_FAILED,
  ]);
}

// ─── 14. Handshake + Heartbeat ───────────────────────────

import {
  createHandshakeInit, createHandshakeResponse, createHeartbeat,
  respondHeartbeat, checkHeartbeatHealth, retryDelay, shouldRetry
} from '../src/protocol/handshake';

function demoHandshake() {
  console.log('\n=== 14. Handshake + Heartbeat Protocol ===');

  const clientPub = new Uint8Array(32);
  crypto.getRandomValues(clientPub);
  const init = createHandshakeInit(clientPub);
  console.log('Handshake init:', {
    type: '0x' + init.type.toString(16),
    version: init.version,
    ciphers: init.supportedCiphers,
  });

  const serverPub = new Uint8Array(32);
  crypto.getRandomValues(serverPub);
  const resp = createHandshakeResponse(serverPub, 'sess_001', 'chacha20-poly1305', 3600_000);
  console.log('Handshake response:', {
    sessionId: resp.sessionId,
    cipher: resp.selectedCipher,
  });

  const hb = createHeartbeat();
  const hbResp = respondHeartbeat(hb);
  console.log('Heartbeat round-trip:', { clientTs: hb.timestamp, serverTs: hbResp.serverTime });

  const state = {
    sessionId: 'sess_001',
    sessionKey: serverPub,
    cipher: 'chacha20-poly1305',
    expiresAt: Date.now() + 3600_000,
    missedHeartbeats: 0,
    lastHeartbeat: Date.now(),
  };
  console.log('Health check:', checkHeartbeatHealth(state));

  console.log('Retry delays:', [0, 1, 2, 3, 4].map(a => retryDelay(a) + 'ms'));
  console.log('shouldRetry(500, attempt=0):', shouldRetry(500, 0));
  console.log('shouldRetry(403, attempt=0):', shouldRetry(403, 0));
}

// ─── 15. DO Pool ─────────────────────────────────────────

import { DOPool, type Executable, type PoolTask } from '../src/runtime/pool';

async function demoDOPool() {
  console.log('\n=== 15. DO Pool (Work-Stealing) ===');

  class DemoWorker implements Executable<string> {
    constructor(public name: string) {}
    async execute(task: PoolTask): Promise<string> {
      return `${this.name} handled ${task.handler}(${JSON.stringify(task.args)})`;
    }
  }

  const pool = new DOPool([
    new DemoWorker('W0'),
    new DemoWorker('W1'),
    new DemoWorker('W2'),
  ]);
  console.log('Pool workers:', pool.workerCount);

  const r1 = await pool.submit<string>({ id: '1', handler: 'greet', args: ['Alice'] });
  const r2 = await pool.submit<string>({ id: '2', handler: 'greet', args: ['Bob'] });
  const r3 = await pool.submit<string>({ id: '3', handler: 'sum', args: [1, 2] });
  console.log('Results:', [r1, r2, r3]);
  console.log('Queue lengths:', pool.getQueueLengths());
}

// ─── 16. Middleware Chain ────────────────────────────────

import { filterApplicable, inlineMiddlewareChain, type Middleware } from '../src/middleware/inline';

async function demoMiddleware() {
  console.log('\n=== 16. Middleware Chain ===');

  const log: string[] = [];

  const mws: Middleware[] = [
    {
      fn: async (_ctx, next) => { log.push('cors'); await next(); },
    },
    {
      fn: async (_ctx, next) => { log.push('auth'); await next(); },
      filter: { prefixurl: '/api' },
    },
    {
      fn: async (_ctx, next) => { log.push('admin'); await next(); },
      filter: { egroup: 'admin' },
    },
  ];

  const applicable = filterApplicable(mws, '/api/users', undefined, undefined);
  console.log('Applicable middleware for /api/users:', applicable.length, '(cors + auth)');

  const chain = inlineMiddlewareChain(applicable);
  await chain({}, async () => { log.push('handler'); });
  console.log('Execution order:', log);
}

// ─── 17. Auth (JWT + Providers + Middleware) ──────────────

import { signJwt, verifyJwt } from '../src/auth/jwt';
import { AnonymousProvider, PasswordProvider, createPasswordHash, verifyPasswordHash } from '../src/auth/providers';
import { authMiddleware, requireAuth, requireGroup } from '../src/auth/middleware';
import type { AuthConfig, AuthSession } from '../src/auth/types';

async function demoAuth() {
  console.log('\n=== 17. Auth System ===');

  // JWT
  const secret = 'demo-secret-key-for-testing-only';
  const token = await signJwt(
    { sid: 's1', owner: 'user_001', isAnonymous: false, ugroups: ['admin'] },
    secret,
    3600
  );
  console.log('JWT token:', token.slice(0, 40) + '...');

  const decoded = await verifyJwt(token, secret);
  console.log('JWT decoded:', { owner: decoded.owner, ugroups: decoded.ugroups });

  // Anonymous provider
  const anonProvider = new AnonymousProvider();
  const anonResult = await anonProvider.authenticate({});
  console.log('Anonymous login:', { owner: anonResult.owner.slice(0, 16) + '...', isAnonymous: true });

  // Password provider
  const hash = await createPasswordHash('mypassword123');
  console.log('Password hash:', hash.slice(0, 40) + '...');

  const valid = await verifyPasswordHash('mypassword123', hash);
  console.log('Password verify:', valid);

  // Auth middleware
  const config: AuthConfig = {
    secret,
    sessionTtlSeconds: 3600,
    allowAnonymous: true,
    providers: [],
  };

  const mw = authMiddleware(config);
  const mctx: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
  await mw.fn(mctx, async () => {});
  console.log('Auth middleware populated ctx:', {
    owner: mctx.owner,
    isAnonymous: mctx.isAnonymous,
    ugroups: mctx.ugroups,
  });
}

// ─── 18. Auth Router ─────────────────────────────────────

import { handleAuthRoute } from '../src/auth/router';

async function demoAuthRouter() {
  console.log('\n=== 18. Auth Router ===');
  console.log('Endpoints:');
  console.log('  POST /auth/anonymous  -> anonymous login');
  console.log('  POST /auth/register   -> email/password registration');
  console.log('  POST /auth/login      -> email/password login');
  console.log('  POST /auth/link       -> link anonymous -> password');
  console.log('  POST /auth/refresh    -> refresh JWT token');
  console.log('  POST /auth/logout     -> revoke session');
  console.log('  GET  /auth/me         -> current user info');
  // Actual calls require a real PG client, so we just show the interface
}

// ─── 19. TiKV Adapter ────────────────────────────────────

import { TiKVDOStub, TiKVKVStore, createTiKVAdapter, type TiKVClient } from '../src/adapters/tikv';

async function demoTiKV() {
  console.log('\n=== 19. TiKV Adapter ===');

  // Mock TiKV client
  const data = new Map<string, string>();
  const tikvClient: TiKVClient = {
    async get(key) { return data.get(key) ?? null; },
    async put(key, value) { data.set(key, value); },
    async delete(key) { data.delete(key); },
    async scan(prefix, limit) {
      const results: Array<{ key: string; value: string }> = [];
      for (const [k, v] of data) {
        if (k.startsWith(prefix)) {
          results.push({ key: k, value: v });
          if (results.length >= limit) break;
        }
      }
      return results;
    },
  };

  const adapter = createTiKVAdapter({ client: tikvClient });
  console.log('Adapter created:', {
    doStub: adapter.doStub instanceof TiKVDOStub,
    kv: adapter.kv instanceof TiKVKVStore,
  });

  // DO stub with TiKV persistence
  await adapter.doStub.set('session', { userId: 'u1', role: 'admin' });
  const session = await adapter.doStub.get('session');
  console.log('DO stub get:', session);

  // KV store with TTL
  await adapter.kv.put('cache:key', JSON.stringify({ cached: true }), { expirationTtl: 3600 });
  const cached = await adapter.kv.get('cache:key');
  console.log('KV store get:', cached);

  // SharedStorage integration
  const shared = new SharedStorage(adapter.doStub, adapter.kv);
  await shared.set('unified', { from: 'tikv' });
  console.log('SharedStorage via TiKV:', await shared.get('unified'));
}

// ─── 20. Node.js Gateway ─────────────────────────────────

import { handleRequest } from '../src/adapters/node-gateway';
import type { RuntimeAdapter, GatewayRequest, RouteHandler } from '../src/adapters/types';
import { HttpError } from '../src/runtime/http';

async function demoNodeGateway() {
  console.log('\n=== 20. Node.js Gateway ===');

  const routes = new Map<string, RouteHandler>();
  routes.set('add', {
    handler: async (_ctx, args) => {
      const [a, b] = args as [number, number];
      return a + b;
    },
    meta: { perm: 0b111 },
  });
  routes.set('whoami', {
    handler: async (ctx) => ctx.owner,
    meta: {},
  });

  const adapter: RuntimeAdapter = {
    doStub: new MemoryDOStub(),
    kv: { async get() { return null; }, async put() {}, async delete() {} },
    pg: mockPg,
    routes,
  };

  // Health check
  const health = await handleRequest({ method: 'GET', path: '/health', headers: {}, body: null }, adapter);
  console.log('GET /health:', JSON.parse(health.body));

  // RPC call
  const rpc = await handleRequest(
    { method: 'POST', path: '/rpc/add', headers: {}, body: [3, 4] },
    adapter
  );
  console.log('POST /rpc/add [3, 4]:', JSON.parse(rpc.body));

  // Owner from header
  const who = await handleRequest(
    { method: 'POST', path: '/rpc/whoami', headers: { 'x-owner': 'alice' }, body: [] },
    adapter
  );
  console.log('POST /rpc/whoami (x-owner: alice):', JSON.parse(who.body));

  // 404
  const notFound = await handleRequest(
    { method: 'POST', path: '/rpc/missing', headers: {}, body: [] },
    adapter
  );
  console.log('POST /rpc/missing:', notFound.status, JSON.parse(notFound.body).error);
}

// ─── 21. Build Cache ─────────────────────────────────────

import { buildCache } from '../src/compiler/cache';

function demoBuildCache() {
  console.log('\n=== 21. Build Cache ===');

  const cache = buildCache([
    { path: 'src/api/users.ts', content: 'export function getUser() {}', dependencies: ['src/db.ts'] },
    { path: 'src/api/tasks.ts', content: 'export function getTasks() {}', dependencies: ['src/db.ts'] },
  ], '0.1.0');

  console.log('Cache version:', cache.version);
  for (const [path, entry] of Object.entries(cache.files)) {
    console.log(`  ${path}: hash=${entry.hash.slice(0, 20)}..., deps=${entry.dependencies}`);
  }
}

// ─── 22. Storage Registry ────────────────────────────────

import { generateStorageRegistry } from '../src/compiler/storage-registry';

function demoStorageRegistry() {
  console.log('\n=== 22. Storage Registry ===');

  const source = `
    interface User { name: string; email: string; }
    interface Task { title: string; done: boolean; }
  `;

  const result = generateStorageRegistry(source);
  console.log('Registry keys:', result.keys);
  console.log('Generated .d.ts:');
  for (const line of result.dts.split('\n')) {
    console.log('  ' + line);
  }
}

// ─── 23. Migration CLI ───────────────────────────────────

import { diffSchemas, generateSQLAddField, createEmptyLockFile, applyMigration } from '../src/cli/migrate';

function demoMigrations() {
  console.log('\n=== 23. Migrations ===');

  const oldSchema = {
    name: { type: 'string', primkey: true },
    email: { type: 'string' },
  };
  const newSchema = {
    name: { type: 'string', primkey: true },
    email: { type: 'string' },
    age: { type: 'number' },
  };

  const diff = diffSchemas(oldSchema, newSchema);
  console.log('Schema diff:', diff);

  const sql = generateSQLAddField('tbl_users_abc', 'age', 'number');
  console.log('Migration SQL:', sql);

  let lock = createEmptyLockFile();
  lock = applyMigration(lock, {
    version: 1,
    changes: [{ type: 'add_field', table: 'users', field: 'age', fieldType: 'number' }],
    sql,
  });
  console.log('Lock file after migration:', { version: lock.version, migrationCount: lock.migrations.length });
}

// ─── 24. HTTP Utilities ──────────────────────────────────

import { HttpResp, UnauthorizedError, ForbiddenError, NotFoundError, PermissionError } from '../src/runtime/http';

function demoHTTP() {
  console.log('\n=== 24. HTTP Utilities ===');

  const ok = HttpResp.ok({ message: 'success' });
  console.log('HttpResp.ok:', { status: ok.status, data: ok.data });

  const created = HttpResp.created({ id: 'new_001' });
  console.log('HttpResp.created:', { status: created.status, data: created.data });

  const noContent = HttpResp.noContent();
  console.log('HttpResp.noContent:', { status: noContent.status });

  const errors = [
    new UnauthorizedError(),
    new ForbiddenError(),
    new NotFoundError(),
    new PermissionError('email'),
  ];
  console.log('Error types:', errors.map(e => `${e.code}(${e.status})`));
}

// ─── Run All Demos ───────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        Kontract Framework — Full Demo        ║');
  console.log('║  Serverless TypeScript with Minimal DB Priv  ║');
  console.log('╚══════════════════════════════════════════════╝');

  // Sync demos
  demoPermissions();
  demoBackendCompiler();
  demoCookbook();
  demoLazyRoutes();
  demoFlatBuffers();
  demoSSE();
  demoWebhooks();
  demoRaystream();
  demoMessageProtocol();
  demoHandshake();
  demoBuildCache();
  demoStorageRegistry();
  demoMigrations();
  demoHTTP();

  // Async demos
  await demoTableProxy();
  await demoSessionDO();
  await demoSharedStorage();
  await demoSWC();
  await demoDOPool();
  await demoMiddleware();
  await demoAuth();
  await demoAuthRouter();
  await demoTiKV();
  await demoNodeGateway();

  console.log('\n════════════════════════════════════════════════');
  console.log(' All 24 modules demonstrated successfully.');
  console.log('════════════════════════════════════════════════');
}

main().catch(console.error);
