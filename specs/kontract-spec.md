# Kontract Framework Specification

**Document Number:** KONTRACT-SPEC-2026-001  
**Version:** 1.0.0  
**Date:** 2026-02-12  
**Status:** Draft

---

## Table of Contents

1. [Scope](#1-scope)
2. [Normative References](#2-normative-references)
3. [Terms and Definitions](#3-terms-and-definitions)
4. [Overview](#4-overview)
5. [Architecture](#5-architecture)
6. [Compilation System](#6-compilation-system)
7. [Runtime Specification](#7-runtime-specification)
8. [Security Model](#8-security-model)
9. [Type System](#9-type-system)
10. [Storage Abstraction](#10-storage-abstraction)
11. [Communication Protocol](#11-communication-protocol)
12. [Migration System](#12-migration-system)
13. [Comparison with Existing Frameworks](#13-comparison-with-existing-frameworks)
14. [Conformance](#14-conformance)
15. [Annexes](#15-annexes)

---

## 1. Scope

### 1.1 General

This document specifies the Kontract framework, a serverless full-stack TypeScript framework that enables end-to-end type-safe application development with minimal database privileges.

### 1.2 Purpose

The Kontract framework provides:
- Unified codebase for frontend and backend logic
- Single database table permission requirement
- End-to-end encryption between client and server
- Zero-configuration MVCC transaction management
- Automatic code splitting and optimization

### 1.3 Application Domain

Kontract is designed for:
- Serverless applications on Cloudflare Workers
- Applications requiring minimal database privileges
- Multi-tenant systems with strict isolation
- Real-time collaborative applications
- Rapid prototyping with production-grade security

---

## 2. Normative References

The following documents are referred to in this specification:

- **RFC 7748** - Elliptic Curves for Security (X25519)
- **RFC 5869** - HMAC-based Key Derivation Function (HKDF)
- **RFC 8439** - ChaCha20 and Poly1305 for IETF Protocols
- **ECMA-262** - ECMAScript Language Specification
- **ISO/IEC 9075** - SQL Standard
- **FlatBuffers** - Google FlatBuffers Specification

---

## 3. Terms and Definitions

### 3.1 Core Concepts

**Backend Function**  
A TypeScript function annotated with `@backend` decorator that executes on the server-side.

**Storage Proxy**  
An interface providing transparent access to PostgreSQL tables through JavaScript object notation.

**raystream**  
The encrypted communication protocol between client and gateway using ECDH + AEAD.

**ptr (Pointer)**  
An indirection mechanism mapping logical table names to physical PostgreSQL table names.

**egroup (Endpoint Group)**  
A logical grouping of backend functions for middleware filtering and organization.

**DO (Durable Object)**  
Cloudflare's stateful serverless primitive used for hot data caching and coordination.

**MVCC (Multi-Version Concurrency Control)**  
Transaction isolation mechanism ensuring consistent reads without locking.

### 3.2 Acronyms

- **ECDH** - Elliptic Curve Diffie-Hellman
- **HKDF** - HMAC-based Key Derivation Function
- **AEAD** - Authenticated Encryption with Associated Data
- **PFS** - Perfect Forward Secrecy
- **SSE** - Server-Sent Events
- **KV** - Key-Value (Cloudflare KV namespace)

---

## 4. Overview

### 4.1 Architecture Philosophy

Kontract follows the principle: **"One Database, One World"**

The framework enables complete backend functionality with only a single database table permission, achieved through:
1. Metadata indirection via `storage` table
2. Permission verification through `trxs` table
3. Zero-trust security model

### 4.2 Key Innovations

#### 4.2.1 Minimal Database Privileges

Traditional frameworks (Prisma, Supabase) require full database ownership or multiple user privileges. Kontract operates with access to exactly **two tables**:
- `storage`: Maps logical names to physical table pointers
- `trxs`: Transaction and permission registry

#### 4.2.2 Compile-Time Code Separation

Functions marked with `@backend` are automatically:
- Extracted to server bundle
- Replaced with RPC stubs in client bundle
- Type signatures preserved across boundary

#### 4.2.3 Stateless Serverless Design

Backend logic runs on Cloudflare Workers with:
- No server state persistence required
- Automatic scaling to zero
- Sub-millisecond cold starts

---

## 5. Architecture

### 5.1 System Components

```
┌─────────────────────────────────────────┐
│  Frontend (Any Framework)               │
│  ├─ import { api } from '@/client'     │
│  └─ WebSocket/SSE subscription         │
└────────────┬────────────────────────────┘
             │ raystream (E2E encrypted)
             │ FlatBuffers serialization
┌────────────▼────────────────────────────┐
│  Cloudflare Workers - Gateway           │
│  ├─ Middleware chain (inlined)          │
│  ├─ Authentication & authorization      │
│  ├─ DO Session (MVCC coordination)     │
│  └─ DO KVC (global shared state)       │
└────────────┬────────────────────────────┘
             │ PostgreSQL client
┌────────────▼────────────────────────────┐
│  PostgreSQL Database                    │
│  ├─ storage (id, ptr, owner, perms)    │
│  ├─ trxs (sid, owner, create_txid)     │
│  └─ Data tables (tbl_*)                 │
│      └─ Webhook triggers → Gateway      │
└─────────────────────────────────────────┘
```

### 5.2 Data Flow

#### 5.2.1 Request Flow

1. Client invokes backend function with typed arguments
2. Arguments serialized to FlatBuffers
3. Encrypted using session key (raystream protocol)
4. Gateway decrypts and authenticates request
5. Middleware chain executes (compile-time inlined)
6. Backend function executes with injected context
7. Response encrypted and returned to client

#### 5.2.2 Storage Access Flow

1. Backend accesses `env.storage.users.get(id)`
2. Storage proxy queries `storage` table for ptr
3. DO cache checked (hot data)
4. PostgreSQL queried with MVCC filter
5. Result cached in DO and returned

### 5.3 Component Responsibilities

#### 5.3.1 Gateway (Cloudflare Workers)

- Request routing and load balancing
- Middleware execution
- Session management
- Encryption/decryption
- Queue management for async operations

#### 5.3.2 DO Session

- Transaction ID allocation
- MVCC visibility tracking
- Active transaction registry
- Session key storage

#### 5.3.3 DO KVC (Key-Value Cache)

- Global shared state
- Rate limiting counters
- Authentication tokens
- Ephemeral data (< 1 hour TTL)

#### 5.3.4 PostgreSQL

- Persistent data storage
- Transaction history
- Trigger-based change notification
- ACID guarantees

---

## 6. Compilation System

### 6.1 Build Pipeline

```
TypeScript Source
    ↓
ESLint Analysis (type extraction)
    ↓
Babel Transform (@backend extraction)
    ↓
Middleware Inlining (next() replacement)
    ↓
SWC Optimization (O3 passes)
    ↓
FlatBuffers Schema Generation
    ↓
Client Bundle + Server Bundle
```

### 6.2 Decorator Specifications

#### 6.2.1 @backend Decorator

**Syntax:**
```typescript
@backend(
  ugroup?: string,
  perm?: Permission,
  egroup?: string
)
```

**Parameters:**
- `ugroup`: Required user group for access (optional)
- `perm`: Required permission bits (R__, _W_, __X, or combinations)
- `egroup`: Endpoint group identifier for middleware filtering

**Example:**
```typescript
@backend(ugroup="admin", perm=perms.WR_, egroup="api-v1")
export async function deleteUser(id: string) {
  await env.storage.users.delete(id);
}
```

#### 6.2.2 @primkey Decorator

**Syntax:**
```typescript
interface Entity {
  @primkey fieldName: type;
}
```

**Behavior:**
- Marks field as primary key in storage table
- Only one field per interface may have this decorator
- If absent, first field is used as primary key

#### 6.2.3 @perm Decorator

**Syntax:**
```typescript
interface Entity {
  @perm(perms.R__) fieldName: type;
}
```

**Permission Bits:**
- `R__ = 0b100`: Read-only
- `_W_ = 0b010`: Write-only
- `__X = 0b001`: Execute/delete
- `RW_ = 0b110`: Read-write
- `RWX = 0b111`: Full access

**Enforcement:**
- Compile-time: Type-level restriction
- Runtime: Explicit checks in generated code

#### 6.2.4 @mwfilter Decorator

**Syntax:**
```typescript
@mwfilter(
  prefixurl?: string,
  egroup?: string,
  endpoints?: string[]
)
```

**Applied to:** Middleware functions

**Filtering Logic:**
- If all parameters omitted: applies to all requests
- If `prefixurl`: applies to URLs starting with prefix
- If `egroup`: applies to endpoints with matching group
- If `endpoints`: applies only to exact endpoint matches

**Example:**
```typescript
export default defineMiddleware([
  @mwfilter(egroup="api-v1")
  async (ctx, next) => {
    await rateLimit(ctx);
    await next();
  }
]);
```

### 6.3 Compilation Phases

#### 6.3.1 Phase 1: Type Extraction

Using TypeScript Compiler API:
1. Parse all source files
2. Extract interface definitions
3. Analyze decorator metadata
4. Build type registry for Storage proxy

**Output:** `StorageRegistry` type mapping

#### 6.3.2 Phase 2: Function Extraction

Using Babel AST transform:
1. Locate functions with `@backend` decorator
2. Extract decorator parameters
3. Generate route registration code
4. Replace client-side with RPC stub

**Client Output:**
```typescript
export async function getUser(id: string): Promise<User | null> {
  return await __kontract_rpc('getUser', [id], {
    egroup: 'api-v1'
  });
}
```

**Server Output:**
```typescript
__kontract_routes.set('getUser', {
  handler: async (ctx: Context, args: [string]) => {
    // Original function body with injected context
    const [id] = args;
    return await env.storage.users.get(id);
  },
  meta: { egroup: 'api-v1', perm: 0b100 }
});
```

#### 6.3.3 Phase 3: Middleware Inlining

Algorithm:
1. Load all middleware from `src/middleware.ts`
2. For each backend function, filter applicable middleware
3. Perform depth-first traversal of middleware AST
4. Replace `await next()` calls with subsequent code
5. Inline resulting code before function body

**Complexity:** O(M × F) where M = middleware count, F = function count

**Optimization:** Middleware with identical filters share inlined code

#### 6.3.4 Phase 4: SWC Optimization

Enabled passes:
- Dead code elimination (DCE)
- Constant folding and propagation
- Function inlining (threshold: 50 AST nodes)
- Variable reduction
- Expression simplification

**Example Optimization:**
```typescript
// Before
const canWrite = ctx.perm & 0b010;  // Known to be 0b100 at compile-time
if (canWrite) {
  await deleteOperation();
}

// After (optimized out entirely)
```

#### 6.3.5 Phase 5: FlatBuffers Generation

For each `@backend` function:
1. Extract parameter types using ESLint analysis
2. Generate FlatBuffers table schema
3. Map TypeScript types to FlatBuffers types
4. Compile `.fbs` to TypeScript using `flatc`
5. Integrate serialization in RPC layer

**Type Mapping:**
```typescript
const TYPE_MAP = {
  'string': 'string',
  'number': 'double',
  'boolean': 'bool',
  'bigint': 'int64',
  'Date': 'int64',
  'Uint8Array': '[ubyte]'
};
```

**Special Annotations:**
```typescript
function createUser(
  name: string,
  @int32 age: number  // Explicit int32 instead of double
) { }
```

### 6.4 Incremental Compilation

#### 6.4.1 Cache Strategy

- **File-level hashing:** SHA-256 of source content
- **Dependency tracking:** Module graph analysis
- **Selective recompilation:** Only changed files + dependents

**Cache Storage:**
```json
// node_modules/.kontract/cache.json
{
  "files": {
    "src/api/users.ts": {
      "hash": "sha256:deadbeef...",
      "dependencies": ["src/types.ts", "src/middleware.ts"],
      "outputs": {
        "client": "dist/client/users.js",
        "server": "dist/server/users.js"
      }
    }
  },
  "version": "1.0.0"
}
```

#### 6.4.2 Trigger Mechanism

When user imports Kontract:
```typescript
import { api } from 'kontract';
```

The module loader:
1. Checks cache validity
2. Recompiles if source changed
3. Returns compiled client bundle

**Implementation:** ESM loader hook in `kontract/loader.mjs`

---

## 7. Runtime Specification

### 7.1 Context Injection

Every backend function receives implicit context:

```typescript
interface Context {
  sid: string;           // Session ID
  owner: string;         // User identifier
  currentTxid: bigint;   // Current transaction ID
  perm: number;          // Permission mask from decorator
  method: string;        // HTTP method
  path: string;          // Request path
  headers: Headers;      // Request headers
  route?: RouteMetadata; // Route information
}
```

**Injection Mechanism:**
- Context declared at file scope: `declare const ctx: Context;`
- Gateway populates context before function invocation
- Not included in function signature (invisible to user)

### 7.2 Storage Proxy

#### 7.2.1 Interface

```typescript
interface TableProxy<T> {
  get(id: string): Promise<T | null>;
  set(id: string, value: T): Promise<void>;
  delete(id: string): Promise<boolean>;
  update(id: string, partial: Partial<T>): Promise<void>;
  
  // List operations (if table is array-like)
  push(value: T): Promise<string>;
  pop(): Promise<T | null>;
  shift(): Promise<T | null>;
  
  // Iteration
  [Symbol.asyncIterator](): AsyncIterableIterator<T>;
  
  // Query
  query(filter: Partial<T>): AsyncIterableIterator<T>;
  
  // Raw SQL (escape hatch)
  exec(sql: string, params?: any[]): Promise<any>;
}
```

#### 7.2.2 Implementation

```typescript
class TableProxy<T> {
  private ptrCache?: string;
  
  async getPtr(): Promise<string> {
    if (this.ptrCache) return this.ptrCache;
    
    // Query storage table
    const result = await this.pg.query(
      'SELECT ptr FROM storage WHERE id = $1 AND owner = $2',
      [this.name, this.ctx.owner]
    );
    
    if (!result.rows[0]) {
      throw new Error(`Table ${this.name} not found`);
    }
    
    this.ptrCache = result.rows[0].ptr;
    return this.ptrCache;
  }
  
  async get(id: string): Promise<T | null> {
    const ptr = await this.getPtr();
    
    // MVCC filtering
    const result = await this.pg.query(
      `SELECT data FROM ${ptr}
       WHERE id = $1 
         AND _txid < $2
         AND (_deleted_txid IS NULL OR _deleted_txid >= $2)`,
      [id, this.ctx.currentTxid]
    );
    
    return result.rows[0]?.data || null;
  }
  
  async set(id: string, value: T): Promise<void> {
    const ptr = await this.getPtr();
    
    // Permission check (generated by compiler)
    this.checkFieldPermissions(value);
    
    // Insert new version
    await this.pg.query(
      `INSERT INTO ${ptr} (id, data, _txid, _owner)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
       SET data = EXCLUDED.data, _txid = EXCLUDED._txid`,
      [id, JSON.stringify(value), this.ctx.currentTxid, this.ctx.owner]
    );
  }
}
```

### 7.3 MVCC Transaction Management

#### 7.3.1 Transaction Lifecycle

```typescript
// DO Session coordinates txid allocation
class SessionDO {
  private currentTxid: bigint = 0n;
  private activeTxs = new Map<string, bigint>();
  
  async allocateTxid(): Promise<bigint> {
    return ++this.currentTxid;
  }
  
  async beginTransaction(owner: string): Promise<Context> {
    const sid = crypto.randomUUID();
    const txid = await this.allocateTxid();
    
    // Register in activeTxs
    this.activeTxs.set(sid, txid);
    
    // Register in trxs table
    await this.pg.query(
      'INSERT INTO trxs (sid, owner, create_txid) VALUES ($1, $2, $3)',
      [sid, owner, txid]
    );
    
    return {
      sid,
      owner,
      currentTxid: txid,
      // ... other fields
    };
  }
  
  async commit(sid: string): Promise<void> {
    this.activeTxs.delete(sid);
    await this.pg.query('DELETE FROM trxs WHERE sid = $1', [sid]);
  }
  
  get minActiveTxid(): bigint {
    if (this.activeTxs.size === 0) return this.currentTxid;
    return Math.min(...this.activeTxs.values());
  }
}
```

#### 7.3.2 Garbage Collection

**Cron Schedule:** Every hour

```sql
CREATE OR REPLACE FUNCTION cleanup_old_versions()
RETURNS void AS $$
DECLARE
  min_txid BIGINT;
BEGIN
  -- Get minimum active txid from DO
  SELECT min_active_txid INTO min_txid FROM __kontract_state;
  
  -- Delete old versions
  FOR tbl IN SELECT ptr FROM storage LOOP
    EXECUTE format(
      'DELETE FROM %I WHERE _txid < %L AND _version < (
        SELECT MAX(_version) FROM %I t2 WHERE t2.id = %I.id
      )',
      tbl.ptr, min_txid - 10000, tbl.ptr, tbl.ptr
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

### 7.4 Shared State (env.shared)

#### 7.4.1 Two-Tier Caching

```typescript
class SharedStorage {
  constructor(
    private do: DurableObjectStub,
    private kv: KVNamespace
  ) {}
  
  async get<T>(key: string): Promise<T | null> {
    // Tier 1: DO memory (hot, 100ms TTL)
    const cached = await this.do.get(key);
    if (cached !== null) return cached;
    
    // Tier 2: KV (warm, 1 hour TTL)
    const kvValue = await this.kv.get(key, 'json');
    if (kvValue) {
      // Backfill DO cache
      await this.do.set(key, kvValue, { ttl: 100 });
      return kvValue;
    }
    
    return null;
  }
  
  async set<T>(
    key: string,
    value: T,
    opts?: { ttl?: number }
  ): Promise<void> {
    // Write to DO (immediate)
    await this.do.set(key, value, opts);
    
    // Write to KV (async, eventual consistency)
    this.kv.put(key, JSON.stringify(value), {
      expirationTtl: opts?.ttl || 3600
    }).catch(err => console.error('KV write failed:', err));
  }
}
```

#### 7.4.2 DO Pool with Work Stealing

```typescript
class DOPool {
  private workers: DurableObjectStub[] = [];
  private queues: Map<string, Task[]> = new Map();
  
  async submit(task: Task): Promise<any> {
    const workerId = this.getLeastBusyWorker();
    const worker = this.workers[workerId];
    
    this.queues.get(workerId)!.push(task);
    
    // Work stealing check
    if (this.shouldSteal()) {
      this.stealWork();
    }
    
    return await worker.execute(task);
  }
  
  private shouldSteal(): boolean {
    const lengths = Array.from(this.queues.values()).map(q => q.length);
    const max = Math.max(...lengths);
    const min = Math.min(...lengths);
    return max > min * 2; // Threshold: 2x difference
  }
  
  private stealWork(): void {
    const sorted = Array.from(this.queues.entries())
      .sort((a, b) => a[1].length - b[1].length);
    
    const [idlerId, idlerQueue] = sorted[0];
    const [busiestId, busiestQueue] = sorted[sorted.length - 1];
    
    const stolen = busiestQueue.splice(0, Math.floor(busiestQueue.length / 2));
    idlerQueue.push(...stolen);
  }
}
```

### 7.5 Event Subscription

#### 7.5.1 Client API

```typescript
// Client-side
import { kontract } from '@/kontract-client';

const unsubscribe = kontract.subscribe('users', (event) => {
  console.log('Change detected:', event);
  // event: { type: 'insert' | 'update' | 'delete', id, data, oldData? }
});

// Later
unsubscribe();
```

#### 7.5.2 Server-Side Events (SSE)

**Gateway Endpoint:**
```typescript
app.get('/stream', async (req, res) => {
  const sid = req.headers.get('x-session-id');
  const trx = await env.trxs.get(sid);
  
  if (!trx) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  // Subscribe to DO events
  const subscriber = await env.DO_SESSION.get(trx.do_id);
  const eventStream = subscriber.subscribe(trx.owner);
  
  for await (const event of eventStream) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
});
```

#### 7.5.3 PostgreSQL Webhook

```sql
CREATE OR REPLACE FUNCTION notify_gateway()
RETURNS TRIGGER AS $$
BEGIN
  -- Post to Cloudflare Queue
  PERFORM http_post(
    'https://gateway.example.com/webhook',
    json_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'new', row_to_json(NEW),
      'old', row_to_json(OLD)
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to all data tables
CREATE TRIGGER users_notify
AFTER INSERT OR UPDATE OR DELETE ON tbl_users_abc
FOR EACH ROW EXECUTE FUNCTION notify_gateway();
```

**Queue Consumer:**
```typescript
export default {
  async queue(batch: MessageBatch, env: Env) {
    for (const msg of batch.messages) {
      const { table, operation, new: newRow } = msg.body;
      
      const subscribers = await env.DO_SESSION.getSubscribers(table);
      
      for (const sub of subscribers) {
        await sub.emit({
          type: operation.toLowerCase(),
          id: newRow.id,
          data: newRow.data
        });
      }
    }
  }
};
```

### 7.6 Response Types

#### 7.6.1 HttpResp Class

```typescript
class HttpResp<T = any> {
  constructor(
    public data: T,
    public status: number = 200,
    public headers: Record<string, string> = {}
  ) {}
  
  static ok<T>(data: T, headers?: Record<string, string>) {
    return new HttpResp(data, 200, headers);
  }
  
  static created<T>(data: T, headers?: Record<string, string>) {
    return new HttpResp(data, 201, headers);
  }
  
  static noContent(headers?: Record<string, string>) {
    return new HttpResp(null, 204, headers);
  }
  
  static redirect(url: string) {
    return new HttpResp(null, 302, { 'Location': url });
  }
}
```

#### 7.6.2 Error Types

```typescript
class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

class NotFoundError extends HttpError {
  constructor(message = 'Not Found') {
    super(message, 404, 'NOT_FOUND');
  }
}

class PermissionError extends HttpError {
  constructor(field: string) {
    super(`Field '${field}' is read-only`, 403, 'PERMISSION_DENIED');
  }
}
```

---

## 8. Security Model

### 8.1 raystream Protocol

#### 8.1.1 Key Exchange

**Algorithm:** ECDH with X25519 curve

**Handshake Flow:**
```
Client                        Gateway
  |                              |
  |--- ClientHello ------------->|
  |    (client_pub, version)     |
  |                              |
  |<-- ServerHello ---------------|
  |    (server_pub, session_id)  |
  |                              |
  [Both compute ECDH shared secret]
  |                              |
  [HKDF key derivation]          |
  |                              |
  |==== Encrypted Channel =======|
```

**Key Derivation:**
```typescript
const sharedSecret = ECDH(client_priv, server_pub);

const sessionKey = HKDF(
  sharedSecret,
  salt: 'raystream-v1',
  info: session_id || client_pub || server_pub,
  length: 32  // 256 bits
);
```

#### 8.1.2 Message Encryption

**Algorithm:** ChaCha20-Poly1305 AEAD

**Nonce Generation:**
```typescript
function generateNonce(sid: string, txid: bigint): Uint8Array {
  const nonce = new Uint8Array(12);
  const view = new DataView(nonce.buffer);
  
  // First 8 bytes: txid (ensures uniqueness)
  view.setBigUint64(0, txid, false);
  
  // Last 4 bytes: counter (for multiple messages in same tx)
  view.setUint32(8, counter, false);
  
  return nonce;
}
```

**Message Format:**
```
+----------+----------------+-----------------+
| nonce    | ciphertext     | authentication  |
| 12 bytes | variable       | tag (16 bytes)  |
+----------+----------------+-----------------+
```

**Properties:**
- **Confidentiality:** ChaCha20 stream cipher
- **Integrity:** Poly1305 MAC
- **Perfect Forward Secrecy:** Ephemeral keys per session
- **Replay Protection:** Nonce includes monotonic txid

#### 8.1.3 Session Management

**Session Expiration:** Configurable (default: 5 minutes)

**Heartbeat:** Required every 60 seconds to keep session alive

**Session Resume:**
```typescript
// If session valid
Client sends: { session_id, last_txid }
Server responds: { resumed: true, current_txid }

// If session expired
Client sends: { session_id }
Server responds: { expired: true }
→ Client initiates new handshake
```

### 8.2 Permission Model

#### 8.2.1 Zero-Trust Architecture

Every operation verifies:
1. **Session validity** (trxs table lookup)
2. **Owner authentication** (JWT or session token)
3. **Permission bits** (decorator-defined requirements)
4. **Field-level access** (per-field @perm decorators)

**Verification Flow:**
```typescript
async function verifyAccess(
  ctx: Context,
  requiredPerm: number
): Promise<void> {
  // 1. Session check
  const trx = await env.trxs.get(ctx.sid);
  if (!trx) throw new UnauthorizedError();
  
  // 2. Owner match
  if (trx.owner !== ctx.owner) throw new ForbiddenError();
  
  // 3. Permission check
  if ((ctx.perm & requiredPerm) !== requiredPerm) {
    throw new PermissionError('Insufficient permissions');
  }
}
```

#### 8.2.2 Table-Level Permissions

Stored in `storage` table:
```sql
CREATE TABLE storage (
  id TEXT PRIMARY KEY,
  ptr TEXT NOT NULL,
  owner TEXT NOT NULL,
  permissions INT NOT NULL  -- Bit mask: RWX
);
```

**Permission Bits:**
- Bit 2 (0b100): Read
- Bit 1 (0b010): Write
- Bit 0 (0b001): Execute/Delete

**Enforcement:**
```typescript
async function checkTablePermission(
  tableName: string,
  operation: 'read' | 'write' | 'delete'
): Promise<void> {
  const meta = await pg.query(
    'SELECT permissions FROM storage WHERE id = $1 AND owner = $2',
    [tableName, ctx.owner]
  );
  
  if (!meta.rows[0]) throw new NotFoundError();
  
  const perms = meta.rows[0].permissions;
  const required = operation === 'read' ? 0b100 :
                   operation === 'write' ? 0b010 : 0b001;
  
  if (!(perms & required)) {
    throw new PermissionError(`Cannot ${operation} table ${tableName}`);
  }
}
```

#### 8.2.3 Field-Level Permissions

Generated at compile-time:
```typescript
// User interface
interface User {
  @primkey id: string;
  @perm(perms.R__) email: string;
  name: string;
}

// Generated permission check
function checkFieldPermissions(data: Partial<User>): void {
  const fieldPerms = {
    'email': 0b100,  // Read-only
    'name': 0b110    // Read-write
  };
  
  for (const [field, value] of Object.entries(data)) {
    if (value !== undefined) {
      const required = fieldPerms[field] ?? 0b110;
      if (!(ctx.perm & 0b010) && !(required & 0b010)) {
        throw new PermissionError(field);
      }
    }
  }
}
```

### 8.3 SQL Injection Prevention

#### 8.3.1 Parameterized Queries

All Storage proxy operations use prepared statements:
```typescript
// ✅ Safe
await pg.query('SELECT * FROM tbl WHERE id = $1', [userId]);

// ❌ Never generated
await pg.query(`SELECT * FROM tbl WHERE id = '${userId}'`);
```

#### 8.3.2 Identifier Sanitization

Table names (ptr values) are validated:
```typescript
function sanitizeIdentifier(name: string): string {
  // Only alphanumeric + underscore
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error('Invalid identifier');
  }
  return name;
}
```

#### 8.3.3 User-Provided SQL (exec method)

Restricted to table owner only:
```typescript
async exec(sql: string, params?: any[]): Promise<any> {
  // 1. Get ptr
  const ptr = await this.getPtr();
  
  // 2. Rewrite SQL (replace table name)
  const rewritten = sql.replace(
    new RegExp(`\\b${this.name}\\b`, 'g'),
    ptr
  );
  
  // 3. Validate no OTHER table access
  if (this.containsOtherTables(rewritten, ptr)) {
    throw new Error('Cannot access other tables');
  }
  
  // 4. Execute
  return await this.pg.query(rewritten, params);
}
```

---

## 9. Type System

### 9.1 End-to-End Type Safety

#### 9.1.1 Type Flow

```
Interface Definition (src/types.ts)
    ↓
TypeScript Compiler API (type extraction)
    ↓
StorageRegistry (compile-time)
    ↓
Client .d.ts generation
    ↓
IDE autocomplete & type checking
```

#### 9.1.2 Storage Registry

**Generated Type:**
```typescript
// Auto-generated: src/.kontract/types.d.ts
declare module 'kontract/runtime' {
  interface StorageRegistry {
    users: User;
    posts: Post;
    comments: Comment;
  }
  
  interface Storage {
    get<K extends keyof StorageRegistry>(
      key: K
    ): TableProxy<StorageRegistry[K]>;
  }
}
```

**Usage:**
```typescript
// Full type inference
const user = await env.storage.users.get('123');
//    ^? const user: User | null

const post = await env.storage.posts.get('456');
//    ^? const post: Post | null
```

### 9.2 Primary Key Inference

**Algorithm:**

1. Check for `@primkey` decorator → use that field
2. If no decorator, check ESLint type analysis
3. If single-field interface → use that field
4. If multi-field interface → use first field
5. If no interface → generate `_id: string` field

**Implementation:**
```typescript
function inferPrimaryKey(
  interfaceName: string,
  checker: ts.TypeChecker
): string {
  const type = checker.getTypeAtLocation(interfaceNode);
  const props = type.getProperties();
  
  // Check decorators
  for (const prop of props) {
    const decorators = prop.getDeclarations()?.[0]?.decorators;
    if (decorators?.some(d => d.getText() === '@primkey')) {
      return prop.name;
    }
  }
  
  // Fallback: first property
  if (props.length > 0) {
    return props[0].name;
  }
  
  // No properties: error
  throw new Error(`Interface ${interfaceName} has no properties`);
}
```

### 9.3 FlatBuffers Type Mapping

```typescript
const TYPE_MAP: Record<string, string> = {
  // Primitives
  'string': 'string',
  'number': 'double',
  'boolean': 'bool',
  'bigint': 'int64',
  
  // Special types
  'Date': 'int64',        // Unix timestamp
  'Uint8Array': '[ubyte]',
  
  // Arrays
  'string[]': '[string]',
  'number[]': '[double]',
  
  // Nested objects → table reference
};

function mapTypeToFlatBuffers(
  tsType: ts.Type,
  checker: ts.TypeChecker
): string {
  const typeStr = checker.typeToString(tsType);
  
  // Check map
  if (TYPE_MAP[typeStr]) {
    return TYPE_MAP[typeStr];
  }
  
  // Array type
  if (checker.isArrayType(tsType)) {
    const elemType = checker.getTypeArguments(tsType)[0];
    return `[${mapTypeToFlatBuffers(elemType, checker)}]`;
  }
  
  // Object type → generate nested table
  if (tsType.flags & ts.TypeFlags.Object) {
    return generateNestedTable(tsType, checker);
  }
  
  // Fallback
  return 'string';
}
```

**Special Annotations:**
```typescript
// Override default number → double mapping
@int8 age: number;
@int32 count: number;
@float32 ratio: number;
```

---

## 10. Storage Abstraction

### 10.1 Table Schema Generation

#### 10.1.1 From Interface

```typescript
// User code
interface User {
  @primkey id: string;
  name: string;
  @perm(perms.R__) email: string;
  age: number;
  tags: string[];
}

// Generated SQL
CREATE TABLE tbl_users_abc123 (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  _version INT DEFAULT 1,
  _txid BIGINT DEFAULT txid_current(),
  _owner TEXT NOT NULL,
  _deleted_txid BIGINT,
  _order BIGSERIAL,
  
  CHECK (data ? 'name'),
  CHECK (data ? 'email'),
  CHECK (data ? 'age')
);

CREATE INDEX idx_users_txid ON tbl_users_abc123(_txid);
CREATE INDEX idx_users_owner ON tbl_users_abc123(_owner);
```

#### 10.1.2 Without Interface

```typescript
// User code (no interface)
await env.storage.todos.push({ text: 'Buy milk', done: false });

// Compiler infers structure
interface __kontract_generated_todos {
  _id: string;
  text: string;
  done: boolean;
}

// Generated SQL (same as above, but with _id as primary key)
```

### 10.2 List Operations

#### 10.2.1 Ordered Storage

Tables support array-like operations via `_order` field:

```typescript
// Push (append)
await env.storage.tasks.push({ title: 'Task 1' });
// → INSERT with _order = MAX(_order) + 1

// Pop (remove last)
const last = await env.storage.tasks.pop();
// → DELETE WHERE _order = MAX(_order) RETURNING data

// Shift (remove first)
const first = await env.storage.tasks.shift();
// → DELETE WHERE _order = MIN(_order) RETURNING data

// Iteration (ordered)
for await (const task of env.storage.tasks) {
  console.log(task);
}
// → SELECT * FROM tbl_tasks ORDER BY _order ASC
```

#### 10.2.2 Implementation

```typescript
class TableProxy<T> {
  async push(value: T): Promise<string> {
    const id = crypto.randomUUID();
    const ptr = await this.getPtr();
    
    await this.pg.query(
      `INSERT INTO ${ptr} (id, data, _order, _txid, _owner)
       VALUES ($1, $2, 
         (SELECT COALESCE(MAX(_order), 0) + 1 FROM ${ptr}),
         $3, $4)`,
      [id, JSON.stringify(value), this.ctx.currentTxid, this.ctx.owner]
    );
    
    return id;
  }
  
  async pop(): Promise<T | null> {
    const ptr = await this.getPtr();
    
    const result = await this.pg.query(
      `DELETE FROM ${ptr}
       WHERE _order = (SELECT MAX(_order) FROM ${ptr})
         AND _txid < $1
       RETURNING data`,
      [this.ctx.currentTxid]
    );
    
    return result.rows[0]?.data || null;
  }
}
```

### 10.3 Query Interface

#### 10.3.1 Simple Filtering

```typescript
// Find all users with name 'Alice'
for await (const user of env.storage.users.query({ name: 'Alice' })) {
  console.log(user);
}

// Generated SQL
SELECT data FROM tbl_users_abc
WHERE data @> '{"name":"Alice"}'::jsonb
  AND _txid < $1
ORDER BY _order;
```

#### 10.3.2 Complex Queries (SQL Escape Hatch)

```typescript
// Raw SQL with parameterization
const results = await env.storage.users.exec(
  `SELECT data FROM users
   WHERE data->>'age' > $1
     AND data @> $2::jsonb
   ORDER BY data->>'name'`,
  [25, JSON.stringify({ active: true })]
);
```

**Automatic Table Name Rewriting:**
- `users` → `tbl_users_abc123` (actual ptr)
- Prevents accessing other tables
- Maintains MVCC filtering

---

## 11. Communication Protocol

### 11.1 raystream Wire Format

#### 11.1.1 Message Structure

```
┌────────────────────────────────────────┐
│ Header (fixed 16 bytes)                │
├────────────────────────────────────────┤
│ - Version (1 byte): 0x01               │
│ - Message Type (1 byte)                │
│ - Flags (2 bytes)                      │
│ - Sequence Number (4 bytes)            │
│ - Payload Length (4 bytes)             │
│ - Reserved (4 bytes)                   │
├────────────────────────────────────────┤
│ Nonce (12 bytes)                       │
├────────────────────────────────────────┤
│ Encrypted Payload (variable)           │
├────────────────────────────────────────┤
│ Authentication Tag (16 bytes)          │
└────────────────────────────────────────┘
```

#### 11.1.2 Message Types

```typescript
enum MessageType {
  HANDSHAKE_INIT = 0x01,
  HANDSHAKE_RESPONSE = 0x02,
  RPC_CALL = 0x10,
  RPC_RESPONSE = 0x11,
  RPC_ERROR = 0x12,
  SUBSCRIBE = 0x20,
  EVENT = 0x21,
  HEARTBEAT = 0x30,
  CLOSE = 0xFF
}
```

#### 11.1.3 RPC Call Format

**Unencrypted Payload (FlatBuffers):**
```
table RPCCall {
  method: string;
  args: [ubyte];      // FlatBuffers-encoded arguments
  metadata: [KeyValue];
}

table KeyValue {
  key: string;
  value: string;
}
```

**Example:**
```typescript
// Client-side
const call = {
  method: 'getUser',
  args: encodeArgs({ id: '123' }),
  metadata: [
    { key: 'egroup', value: 'api-v1' },
    { key: 'trace-id', value: 'abc-123' }
  ]
};

const payload = encodeRPCCall(call);
const encrypted = await encrypt(payload, sessionKey, nonce);
```

### 11.2 Connection Management

#### 11.2.1 Handshake Protocol

**Step 1: Client Hello**
```typescript
{
  type: HANDSHAKE_INIT,
  version: 1,
  client_pub: Uint8Array(32),  // X25519 public key
  supported_ciphers: ['chacha20-poly1305', 'aes-256-gcm']
}
```

**Step 2: Server Hello**
```typescript
{
  type: HANDSHAKE_RESPONSE,
  version: 1,
  server_pub: Uint8Array(32),
  session_id: 'uuid-v7',
  selected_cipher: 'chacha20-poly1305',
  expires_at: timestamp
}
```

**Step 3: Key Derivation (Both Sides)**
```typescript
const shared = ECDH(my_priv, their_pub);
const sessionKey = HKDF(shared, 'raystream-v1', session_id, 32);
```

#### 11.2.2 Heartbeat Mechanism

**Interval:** 60 seconds

**Format:**
```typescript
{
  type: HEARTBEAT,
  timestamp: Date.now()
}
```

**Response:**
```typescript
{
  type: HEARTBEAT,
  timestamp: original_timestamp,
  server_time: Date.now()
}
```

**Missed Heartbeat Handling:**
- 1 miss: Log warning
- 2 misses: Attempt reconnection
- 3 misses: Session terminated

### 11.3 Error Handling

#### 11.3.1 Error Response Format

```typescript
{
  type: RPC_ERROR,
  error_code: string,
  error_message: string,
  status: number,
  stack_trace?: string  // Only in development
}
```

#### 11.3.2 Error Codes

```typescript
enum ErrorCode {
  // Client errors (4xx)
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  INVALID_REQUEST = 'INVALID_REQUEST',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  // Server errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  
  // Protocol errors
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  INVALID_NONCE = 'INVALID_NONCE'
}
```

#### 11.3.3 Retry Strategy

**Client-side automatic retry:**
1. Network errors: Exponential backoff (max 3 retries)
2. Timeout: Increase timeout, retry once
3. Session expired: Re-handshake, retry original request
4. 5xx errors: Retry with backoff
5. 4xx errors: No retry (user error)

**Backoff Formula:**
```typescript
const delay = Math.min(
  BASE_DELAY * Math.pow(2, attempt),
  MAX_DELAY
);
// BASE_DELAY = 100ms, MAX_DELAY = 10s
```

---

## 12. Migration System

### 12.1 Lock File Format

```json
{
  "version": 5,
  "tables": {
    "users": {
      "ptr": "tbl_users_abc123",
      "schema": {
        "id": { "type": "string", "primkey": true },
        "name": { "type": "string" },
        "email": { "type": "string", "perm": 4 }
      },
      "hash": "sha256:deadbeef..."
    }
  },
  "migrations": [
    {
      "version": 5,
      "timestamp": "2026-02-12T10:30:00Z",
      "changes": [
        {
          "type": "add_field",
          "table": "users",
          "field": "email",
          "fieldType": "string"
        }
      ],
      "sql": "ALTER TABLE tbl_users_abc123 ADD COLUMN email TEXT;"
    }
  ]
}
```

### 12.2 Automatic Migration

#### 12.2.1 Safe Changes

Automatically handled:
- Adding new fields (with DEFAULT value)
- Adding new tables
- Adding indexes
- Changing field permissions (metadata only)

**Example:**
```typescript
// Old
interface User {
  id: string;
  name: string;
}

// New
interface User {
  id: string;
  name: string;
  email: string;  // Added
}

// Generated migration
ALTER TABLE tbl_users_abc123 
ADD COLUMN email TEXT DEFAULT NULL;
```

#### 12.2.2 Dangerous Changes

Require manual migration:
- Removing fields
- Changing field types
- Changing primary key
- Renaming fields

**Error Message:**
```
❌ Cannot auto-migrate: field 'old_email' was removed

Please create a manual migration:

  migrations/0006_remove_old_email.ts

Guide: https://kontract.dev/docs/migrations
```

### 12.3 Manual Migration

#### 12.3.1 Migration File Format

```typescript
// migrations/0006_rename_email_field.ts
import { Migration } from 'kontract/migration';

export default {
  version: 6,
  
  up: async (db: MigrationDB) => {
    await db.exec(`
      ALTER TABLE tbl_users_abc123
      RENAME COLUMN old_email TO email;
    `);
    
    // Update storage metadata
    await db.updateSchema('users', {
      email: { type: 'string', perm: 0b100 }
    });
  },
  
  down: async (db: MigrationDB) => {
    await db.exec(`
      ALTER TABLE tbl_users_abc123
      RENAME COLUMN email TO old_email;
    `);
    
    await db.updateSchema('users', {
      old_email: { type: 'string', perm: 0b100 }
    });
  }
} satisfies Migration;
```

#### 12.3.2 Migration CLI

```bash
# Generate migration file
$ kontract migrate create rename_email_field

Created: migrations/0006_rename_email_field.ts

# Apply migrations
$ kontract migrate up

Running migration 0006_rename_email_field... ✓
Updated kontract.lock.json

# Rollback
$ kontract migrate down

Rolling back migration 0006_rename_email_field... ✓
```

### 12.4 Migration Guide (TODO)

**Planned Documentation:**
- Mermaid diagram: Migration decision tree
- Step-by-step examples for common scenarios
- Best practices for data transformation
- Testing migrations in staging environment
- Rollback strategies

**Location:** `docs/migrations.md`

---

## 13. Comparison with Existing Frameworks

### 13.1 Feature Matrix

| Feature | Kontract | Supabase | Convex | Prisma + tRPC |
|---------|----------|----------|--------|---------------|
| **Database Privileges** | ✅ Single table | ❌ Full DB | ❌ Managed service | ❌ Full DB |
| **Code Colocation** | ✅ Single codebase | ❌ Separate | ⚠️ Limited | ❌ Separate |
| **Type Safety** | ✅ E2E | ⚠️ Manual | ✅ E2E | ✅ E2E |
| **Real-time** | ✅ Built-in (SSE/WS) | ✅ Built-in | ✅ Built-in | ❌ Manual |
| **Encryption** | ✅ E2E (raystream) | ⚠️ TLS only | ⚠️ TLS only | ⚠️ TLS only |
| **Serverless** | ✅ CF Workers | ✅ Managed | ✅ Managed | ⚠️ Self-host |
| **MVCC** | ✅ Built-in | ✅ PostgreSQL | ✅ Custom | ⚠️ DB-dependent |
| **Multi-tenancy** | ✅ ptr isolation | ⚠️ RLS | ⚠️ Manual | ⚠️ Manual |
| **Cold Start** | ✅ <10ms | ⚠️ 100ms+ | ✅ <50ms | ⚠️ 500ms+ |
| **Vendor Lock-in** | ⚠️ CF Workers | ✅ Low | ❌ High | ✅ Low |

### 13.2 Architecture Comparison

#### 13.2.1 Kontract vs Supabase

**Supabase:**
```
Frontend → PostgREST → PostgreSQL
           ↑
      Row-Level Security (RLS)
```

**Limitations:**
- Requires full database ownership
- RLS policies can be complex
- No built-in E2E encryption
- Difficult multi-tenancy isolation

**Kontract:**
```
Frontend → Gateway (CF Workers) → PostgreSQL
              ↓
          DO (Hot cache)
```

**Advantages:**
- Single table permission
- Zero-trust enforcement in Gateway
- E2E encryption (raystream)
- Perfect tenant isolation (ptr)

#### 13.2.2 Kontract vs Convex

**Convex:**
```
Frontend → Convex Cloud → Proprietary DB
```

**Limitations:**
- High vendor lock-in
- Proprietary query language
- No self-hosting option
- Expensive at scale

**Kontract:**
```
Frontend → CF Workers → Any PostgreSQL
```

**Advantages:**
- Standard SQL database
- Self-hostable
- Lower cost (CF Workers pricing)
- Familiar PostgreSQL ecosystem

#### 13.2.3 Kontract vs Prisma + tRPC

**Prisma + tRPC:**
```
Frontend → tRPC → Backend (Node.js) → Prisma → PostgreSQL
```

**Limitations:**
- Separate codebases (mental overhead)
- Requires server infrastructure
- Manual security implementation
- No built-in real-time

**Kontract:**
```
Frontend ←──────────────────→ PostgreSQL
         (unified codebase)
```

**Advantages:**
- Single codebase (better DX)
- Automatic code splitting
- Built-in security model
- Built-in subscriptions

### 13.3 Use Case Recommendations

#### 13.3.1 Choose Kontract When:

- ✅ Shared/hosted database environment (limited privileges)
- ✅ Serverless-first architecture
- ✅ Need E2E encryption
- ✅ Multi-tenant application with strict isolation
- ✅ Rapid prototyping with production-grade security
- ✅ Team comfortable with TypeScript

#### 13.3.2 Choose Alternatives When:

**Supabase:**
- Need full PostgreSQL features (triggers, views, custom functions)
- Want managed auth and storage
- Team prefers REST over RPC

**Convex:**
- Prioritize developer experience over cost
- Don't need self-hosting
- Team prefers reactive programming model

**Prisma + tRPC:**
- Need maximum flexibility
- Have existing Node.js infrastructure
- Require custom database optimizations

### 13.4 Migration Path

#### 13.4.1 From Supabase to Kontract

1. Export Supabase schema
2. Generate Kontract interfaces from schema
3. Migrate RLS policies to `@backend` decorators
4. Replace PostgREST calls with typed functions
5. Deploy Gateway to CF Workers

**Estimated effort:** 2-4 weeks for medium app

#### 13.4.2 From Prisma + tRPC to Kontract

1. Keep existing Prisma schema
2. Generate Kontract Storage interfaces
3. Replace tRPC routers with `@backend` functions
4. Unify frontend/backend repos
5. Deploy Gateway

**Estimated effort:** 1-2 weeks for medium app

---

## 14. Conformance

### 14.1 Implementation Requirements

A conformant Kontract implementation MUST:

1. Support TypeScript 5.0 or later
2. Generate valid FlatBuffers schemas
3. Implement raystream protocol with ChaCha20-Poly1305
4. Enforce MVCC isolation for all storage operations
5. Validate permissions at Gateway level
6. Support PostgreSQL 14 or later

### 14.2 Optional Features

A conformant implementation MAY:

1. Support additional AEAD ciphers (AES-256-GCM)
2. Implement alternative serialization (Protocol Buffers, MessagePack)
3. Provide ORM-like query builders
4. Support databases other than PostgreSQL (with MVCC)

### 14.3 Testing Requirements

Implementations SHOULD provide:

1. Unit tests for compilation pipeline
2. Integration tests for Gateway
3. End-to-end tests for client-server communication
4. Security tests for permission enforcement
5. Performance benchmarks

---

## 15. Annexes

### Annex A: Reference Implementation

Official implementation: https://github.com/kontract-framework/kontract

### Annex B: Security Considerations

**Threat Model:**
- Untrusted client (cannot forge permissions)
- Network attacker (cannot decrypt raystream)
- Malicious tenant (cannot access other tenants' data)
- Compromised gateway (limited blast radius due to ptr isolation)

**Mitigations:**
- E2E encryption (raystream)
- Zero-trust permission model
- Physical table isolation (ptr)
- Rate limiting in DO
- SQL injection prevention

### Annex C: Performance Benchmarks (TODO)

**Planned Metrics:**
- Cold start latency
- Hot path throughput
- Storage operation latency
- Memory usage
- Comparison with competitors

### Annex D: TODO List

#### High Priority
- [ ] Complete migration guide with Mermaid diagrams
- [ ] Performance benchmark suite
- [ ] Security audit of raystream implementation
- [ ] Production deployment guide

#### Medium Priority
- [ ] CLI tool for project scaffolding
- [ ] VS Code extension for syntax highlighting
- [ ] Integration with popular frontend frameworks
- [ ] Monitoring and observability guide

#### Low Priority
- [ ] GraphQL compatibility layer
- [ ] Alternative database backends (MySQL, SQLite)
- [ ] Plugin system for custom storage backends
- [ ] Admin dashboard for managing storage/permissions

### Annex E: Glossary

**Terms specific to Kontract:**

- **ptr (Pointer):** Physical table name in PostgreSQL
- **egroup (Endpoint Group):** Logical grouping for middleware
- **raystream:** Encrypted communication protocol
- **Storage Proxy:** JavaScript interface to database tables
- **DO (Durable Object):** Cloudflare's stateful primitive
- **Context:** Injected request metadata in backend functions

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-12 | Initial specification |

---

## Copyright Notice

Copyright © 2026 Kontract Framework Contributors

This specification is provided under the MIT License.

---

**END OF SPECIFICATION**
